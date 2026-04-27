/* ===========================================================
   DEARSTAGE Renewal — main.js
   - splash intro
   - YouTube hero bg
   - i18n (JP/EN)
   - schedule filters & rendering
   - news / artist rendering
   - language switcher
   - header scroll behavior
   - reveal on scroll
   =========================================================== */

(function(){
  "use strict";

  /* ---------- helpers ---------- */
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const html = (s) => s; // tagged template marker

  const escapeHTML = (str) => String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  /* ---------- state ---------- */
  const TAGS_ALL = ["LIVE","EVENT","RELEASE","STAGE","STREAM","TV","RADIO","MAGAZINE","WEB","TICKET","OTHER"];
  const state = {
    lang: localStorage.getItem("ds_lang") || "jp",
    sch: {
      tags: new Set(TAGS_ALL),       // selected tags (default: all)
      artists: new Set(),            // selected artist ids (empty = all)
      keyword: "",
      year: 0, month: 0,             // active month, 0 = all
      view: "list",                  // "list" | "cal"
      showAllMonths: true            // when true, show all months; toggled off when user picks a month
    }
  };

  /* ---------- i18n ---------- */
  const t = () => window.DS_I18N[state.lang];

  function applyI18n(){
    document.documentElement.lang = (state.lang === "jp" ? "ja" : "en");
    $$("[data-i18n]").forEach(el => {
      const path = el.getAttribute("data-i18n").split(".");
      let v = t();
      for (const k of path) v = v ? v[k] : undefined;
      if (typeof v === "string") el.innerHTML = v;
    });
    $("#langCur").textContent = state.lang.toUpperCase();
    $("#floatLangCur").textContent = state.lang.toUpperCase();
  }

  /* ---------- splash ---------- */
  function splashOut(){
    const sp = $("#splash");
    if (!sp) return;
    sp.classList.add("is-out");
    document.body.classList.remove("is-loading");
    document.body.classList.add("is-ready");
    setTimeout(()=> sp.remove(), 1300);
  }
  function setupSplash(){
    const skip = $("#splashSkip");
    if (skip) skip.addEventListener("click", splashOut);
    // primary timer (4s as requested)
    setTimeout(splashOut, 4000);
    // safety net: dismiss after 6s no matter what (in case primary timer was missed)
    setTimeout(() => {
      const sp = document.getElementById("splash");
      if (sp && !sp.classList.contains("is-out")) splashOut();
    }, 6000);
  }

  /* ---------- YouTube hero (with fallback + swap) ---------- */
  // Hero "trailer" pool. Click the trailer button to swap to a different
  // (random) clip. The originally-shared k1-VJqwNNu4 is the default starting
  // video. Override via window.DS_HERO_VIDEOS.
  const HERO_VIDEO_POOL = (window.DS_HERO_VIDEOS && window.DS_HERO_VIDEOS.length)
    ? window.DS_HERO_VIDEOS
    : [
        "k1-VJqwNNu4", // originally shared
        "fMHj3U3-RA4", // でんぱ組.inc「でんでんぱっしょ」MV
        "bexHugfKowk", // でんぱ組.inc「プリンセスでんぱパワー！シャインオン！」MV
        "6H2Xiw6OyOw", // でんぱ組.inc『ドキ+ワク=パレード！』Music Video
        "ejAMVcO_kF8", // でんぱ組.inc「衝動的S/K/S/D」Music Video
        "sOin4bwUQ5c", // でんぱ組.inc「ちゅるりちゅるりら」MV
        "lAfPuUaSZQc"  // でんぱ組.inc テレワークMV
      ];
  let _heroVidIdx = 0; // start with the originally shared k1-VJqwNNu4
  const _heroFailed = new Set(); // indices that have failed to embed

  function _heroSetIdxBadge(){
    const idxEl = document.getElementById("heroLiveIdx");
    if (idxEl) idxEl.textContent = `${_heroVidIdx + 1}/${HERO_VIDEO_POOL.length}`;
  }

  function _heroPickNext(excludeCurrent){
    // Random untried index. Excludes failed and (optionally) the current.
    const candidates = HERO_VIDEO_POOL
      .map((_,i) => i)
      .filter(i => !_heroFailed.has(i) && (!excludeCurrent || i !== _heroVidIdx));
    if (!candidates.length) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // YouTube IFrame API error codes that indicate the embed cannot work
  // (we should auto-skip to the next video):
  //   2   - bad parameter / videoId
  //   5   - HTML5 player error
  //   100 - video not found
  //   101 - embedding disabled by uploader
  //   150 - same as 101 (embedding disabled)
  //   153 - player config / restriction error (region / domain)
  // Any error code → treat as fatal for that videoId.

  function _mountIframeFor(idx){
    const vid = HERO_VIDEO_POOL[idx];
    const slot = $("#heroYt");
    if (!slot) return;
    slot.innerHTML = "";
    slot.classList.remove("is-failed");
    _heroSetIdxBadge();

    const ph = document.createElement("div");
    ph.id = "heroYtPlayer";
    slot.appendChild(ph);

    let readyFired = false;
    let killed = false;

    const handleFatal = (reason) => {
      if (killed) return;
      killed = true;
      _heroFailed.add(idx);
      const next = _heroPickNext(true);
      if (next >= 0){
        // Try the next pool entry — quietly.
        _heroVidIdx = next;
        _mountIframeFor(next);
      } else {
        // Exhausted — fall back to animated gradient
        slot.classList.add("is-failed");
      }
    };

    const onAPIReady = () => {
      try {
        new YT.Player("heroYtPlayer", {
          videoId: vid,
          host: "https://www.youtube.com",
          playerVars: {
            autoplay: 1, mute: 1, controls: 0, loop: 1,
            playlist: vid, playsinline: 1, modestbranding: 1,
            rel: 0, showinfo: 0, iv_load_policy: 3, disablekb: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (e) => {
              readyFired = true;
              try{ e.target.mute(); e.target.playVideo(); }catch(_){}
            },
            onError: () => handleFatal("yt-error"),
            onStateChange: (e) => {
              // -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
              // If the player reports "ended" almost immediately, treat as failure.
              if (e.data === 0 && !readyFired) handleFatal("ended-without-play");
            }
          }
        });
      } catch(_) { handleFatal("ctor"); }
    };

    if (window.YT && window.YT.Player){ onAPIReady(); }
    else {
      window.onYouTubeIframeAPIReady = onAPIReady;
      if (!document.getElementById("__yt_api")){
        const s = document.createElement("script");
        s.id = "__yt_api";
        s.src = "https://www.youtube.com/iframe_api";
        s.async = true;
        s.onerror = () => handleFatal("api-load");
        document.head.appendChild(s);
      }
    }

    // Watchdog: if onReady doesn't fire in 6 seconds, treat as embed failure
    setTimeout(() => {
      if (!readyFired && !killed) handleFatal("watchdog-no-ready");
    }, 6000);
  }

  function mountYouTube(){
    _heroVidIdx = 0;
    _heroFailed.clear();
    _mountIframeFor(_heroVidIdx);

    const btn = $("#heroNext");
    if (btn){
      btn.addEventListener("click", e => {
        e.preventDefault();
        if (HERO_VIDEO_POOL.length <= 1) return;
        // Pick a random different index, skipping known-failed ones
        const next = _heroPickNext(true);
        if (next < 0) return;
        _heroVidIdx = next;
        _mountIframeFor(_heroVidIdx);
      });
    }
  }

  /* ---------- ribbon: SVG draw-in stroke + observer ---------- */
  function setupRibbonDraw(){
    const ribbons = $$(".ribbon");
    ribbons.forEach(rb => {
      const p = rb.querySelector("svg defs path");
      let len = 3000;
      try { if (p && typeof p.getTotalLength === "function") len = Math.ceil(p.getTotalLength()); }
      catch(_){}
      rb.style.setProperty("--rb-len", len);
    });
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting){
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    ribbons.forEach(rb => io.observe(rb));
  }

  /* ---------- ribbon textPath flow ---------- */
  function startRibbonFlow(){
    const tps = document.querySelectorAll(".ribbon__txt textPath");
    if (!tps.length) return;
    const offsets = new Array(tps.length).fill(0);
    let last = performance.now();
    function tick(now){
      const dt = Math.min((now - last) / 1000, .1);
      last = now;
      tps.forEach((tp, i) => {
        // alternate direction per ribbon for visual variety
        const dir = (i % 2 === 0) ? -1 : 1;
        offsets[i] += dt * 28 * dir;
        // Wrap so values stay bounded
        if (offsets[i] >  3000) offsets[i] -= 3000;
        if (offsets[i] < -3000) offsets[i] += 3000;
        tp.setAttribute("startOffset", offsets[i]);
      });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- hero marquee + tape tracks ---------- */
  function buildMarquees(){
    const heroT = $("#heroMarquee");
    if (heroT){
      const segs = ['<span class="mq">DEARSTAGE</span>','<span class="star">★</span>',
                    '<span class="mq mq--out">SINCE 2011</span>','<span class="star">✦</span>',
                    '<span class="mq">IDOL × CULTURE</span>','<span class="star">✺</span>',
                    '<span class="mq mq--out">TOKYO</span>','<span class="star">✦</span>'];
      const block = segs.join("");
      heroT.innerHTML = block.repeat(6);
    }

    const buildTape = (id, items) => {
      const el = document.getElementById(id);
      if (!el) return;
      const block = items.map((s,i) => i%2===0
        ? `<span class="tt">${escapeHTML(s)}</span><span class="ic">♪</span>`
        : `<span class="tt tt--out">${escapeHTML(s)}</span><span class="ic">♪</span>`
      ).join("");
      el.innerHTML = block.repeat(8);
    };
    buildTape("tapeBlack",  ["Let's Check It Out", "DEARSTAGE", "Play List", "OFFICIAL"]);
    buildTape("tapePink",   ["Play List", "DEARSTAGE", "Let's Check It Out", "WEBSITE"]);
    buildTape("tapePink2",  ["Schedule", "Live & Event", "Don't Miss", "DSPM"]);
    buildTape("tapeBlack2", ["Artist Roster", "DEARSTAGE", "Since 2011", "TOKYO"]);

    // Hero diagonal strip
    const heroStrip = $("#heroStrip");
    if (heroStrip){
      // Properly-centered SVG note icon (avoids ♪ glyph baseline drift)
      const noteSVG = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path fill="currentColor" d="M11 2.5v6.4a2.6 2.6 0 1 1-1.4-2.3V4.1l-4 1V11a2.6 2.6 0 1 1-1.4-2.3V3.4l6.8-1.8z"/>
      </svg>`;
      const starSVG = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 1l1.8 4.5L14.5 6l-3.5 3 1 4.7L8 11.3 4 13.7l1-4.7-3.5-3 4.7-.5z"/></svg>`;
      const items = [
        ["txt","Welcome to DEARSTAGE"], ["ic", starSVG],
        ["out","Let's Check It Out"],   ["ic", noteSVG],
        ["txt","Play List"],            ["ic", starSVG],
        ["out","Idol × Culture"],       ["ic", noteSVG]
      ];
      heroStrip.innerHTML = items.map(([cls, body]) =>
        cls === "ic" ? `<span class="ic">${body}</span>`
                     : `<span class="${cls === "out" ? "out" : ""}">${body}</span>`
      ).join("").repeat(6);
    }
  }

  /* ---------- hero strip "rip" effect (after 10s) ---------- */
  function setupHeroStripTear(){
    const strip = $(".hero__strip");
    if (!strip) return;
    // Build top + bottom halves: clone the strip and overlay them, then animate apart
    const top = strip.cloneNode(true);
    top.classList.add("hero__strip--top");
    const bot = strip; // original becomes the bottom half
    bot.classList.add("hero__strip--bot");
    bot.parentNode.insertBefore(top, bot);

    // After 10s, kick off the tear-and-fly-apart animation
    setTimeout(() => {
      top.classList.add("is-tearing");
      bot.classList.add("is-tearing");
      // After fly-off, remove from DOM
      setTimeout(() => { top.remove(); bot.remove(); }, 1400);
    }, 10000);
  }

  /* ---------- hero clock ---------- */
  function startHeroClock(){
    const el = $("#heroLiveTime");
    if (!el) return;
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2,"0");
      const mm = String(d.getMinutes()).padStart(2,"0");
      const ss = String(d.getSeconds()).padStart(2,"0");
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- header scroll behavior ---------- */
  function setupHeader(){
    const hd = $("#hd");
    const burger = $("#burger");
    if (burger){
      burger.addEventListener("click", () => hd.classList.toggle("is-open"));
      $$("#hd .hd__nav a").forEach(a => a.addEventListener("click", () => hd.classList.remove("is-open")));
    }

    // Hide-on-hero, show-on-scroll behavior.
    const hero = $(".hero");
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
      const inHero = heroBottom > 60;
      const goingUp = y < lastY;

      if (inHero && y < 120){
        // Hero & near top: hide header (only logo float can stay if needed)
        hd.classList.add("hd--hidden");
        hd.classList.remove("hd--solid");
      } else {
        hd.classList.remove("hd--hidden");
        hd.classList.add("hd--solid");
      }
      // hide on scroll-down (but keep visible while scrolling up)
      if (!inHero){
        if (!goingUp && y > 240){
          hd.classList.add("hd--retreat");
        } else {
          hd.classList.remove("hd--retreat");
        }
      } else {
        hd.classList.remove("hd--retreat");
      }
      lastY = y;
      ticking = false;
    };

    window.addEventListener("scroll", () => {
      if (!ticking){ requestAnimationFrame(update); ticking = true; }
    }, { passive:true });
    update();
  }

  /* ---------- language switcher ---------- */
  function setupLang(){
    const lang   = $("#lang");
    const btn    = $("#langBtn");
    const menu   = $("#langMenu");
    const float  = $("#floatLang");

    const setLang = (l) => {
      state.lang = l;
      localStorage.setItem("ds_lang", l);
      applyI18n();
      renderAll();
    };

    btn.addEventListener("click", e => {
      e.stopPropagation();
      lang.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", lang.classList.contains("is-open"));
    });
    document.addEventListener("click", () => lang.classList.remove("is-open"));

    menu.addEventListener("click", e => {
      const li = e.target.closest("[data-lang]");
      if (!li) return;
      setLang(li.dataset.lang);
      lang.classList.remove("is-open");
    });

    float.addEventListener("click", () => {
      setLang(state.lang === "jp" ? "en" : "jp");
    });
  }

  /* ---------- date utils ---------- */
  const WD_JP = ["日","月","火","水","木","金","土"];
  const WD_EN = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const fmtHeroDate = () => {
    const d = new Date();
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
    return `${y}.${m}.${dd}`;
  };

  /* ---------- render: news ---------- */
  function renderNews(){
    const grid = $("#newsGrid");
    if (!grid) return;
    const lang = state.lang;
    grid.innerHTML = window.DS_DATA.news.slice(0,6).map(n => {
      const cat = lang==="jp" ? n.category_jp : n.category_en;
      const title = lang==="jp" ? n.title_jp : n.title_en;
      return `
        <article class="news-card reveal">
          <div class="news-card__head">
            <time class="news-card__date">${escapeHTML(n.date)}</time>
            <span class="news-card__cat">${escapeHTML(cat)}</span>
          </div>
          <h3 class="news-card__title">${escapeHTML(title)}</h3>
          <span class="news-card__more">${t().common.more} <i>→</i></span>
        </article>`;
    }).join("");
  }

  /* ---------- render: schedule (HelloProject-style search) ---------- */
  function getFilteredSchedule(){
    const s = state.sch;
    const kw = s.keyword.trim().toLowerCase();
    return window.DS_DATA.schedule
      .filter(it => s.tags.has(it.tag))
      .filter(it => s.artists.size === 0 || s.artists.has(it.artist))
      .filter(it => {
        if (s.showAllMonths) return true;
        const d = new Date(it.date + "T00:00:00");
        return d.getFullYear() === s.year && d.getMonth() === s.month;
      })
      .filter(it => {
        if (!kw) return true;
        const haystack = [it.title_jp, it.title_en, it.venue_jp, it.venue_en, it.tag].join(" ").toLowerCase();
        const artist = window.DS_DATA.artists.find(a => a.id === it.artist);
        if (artist) return haystack.includes(kw) || artist.name_jp.toLowerCase().includes(kw) || artist.name_en.toLowerCase().includes(kw);
        return haystack.includes(kw);
      })
      .sort((a,b) => a.date.localeCompare(b.date) || (a.time||"").localeCompare(b.time||""));
  }

  function renderSchTags(){
    const wrap = $("#schTags");
    if (!wrap) return;
    const labels = t().schedule.tags;
    wrap.innerHTML = TAGS_ALL.map(k =>
      `<button type="button" class="tag-chip ${state.sch.tags.has(k)?"is-on":""}" data-tag="${k}">
        <span class="chk"></span>${escapeHTML(labels[k] || k)}
      </button>`
    ).join("");
    wrap.querySelectorAll(".tag-chip").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.tag;
      if (state.sch.tags.has(k)) state.sch.tags.delete(k);
      else state.sch.tags.add(k);
      renderSchTags(); renderSchAll();
    }));
  }

  function renderSchArtists(){
    const wrap = $("#schArtistList");
    if (!wrap) return;
    const lang = state.lang;
    wrap.innerHTML = window.DS_DATA.artists.map(a =>
      `<label>
        <input type="checkbox" data-aid="${a.id}" ${state.sch.artists.has(a.id)?"checked":""}/>
        <span class="dot" style="background:${a.color}"></span>
        <span>${escapeHTML(lang==="jp"?a.name_jp:a.name_en)}</span>
      </label>`
    ).join("");
    wrap.querySelectorAll("input[type=checkbox]").forEach(input => input.addEventListener("change", () => {
      const id = input.dataset.aid;
      if (input.checked) state.sch.artists.add(id);
      else state.sch.artists.delete(id);
      updateArtistSummary(); renderSchAll();
    }));
    updateArtistSummary();
  }

  function updateArtistSummary(){
    const sum = $("#schArtistSummary");
    if (!sum) return;
    const sel = state.sch.artists;
    if (sel.size === 0){ sum.textContent = t().schedule.artistAll; return; }
    if (sel.size === 1){
      const id = [...sel][0];
      const a = window.DS_DATA.artists.find(x=>x.id===id);
      if (a) sum.textContent = state.lang==="jp"?a.name_jp:a.name_en;
      else sum.textContent = `${sel.size}`;
      return;
    }
    sum.textContent = (state.lang==="jp"?"選択中: ":"Selected: ") + sel.size;
  }

  function renderSchMonth(){
    const y = $("#schYear"), m = $("#schMonth");
    if (!y || !m) return;
    if (state.sch.showAllMonths){
      y.textContent = state.lang==="jp" ? "すべて" : "ALL";
      m.textContent = "";
    } else {
      y.textContent = state.sch.year;
      m.textContent = String(state.sch.month + 1).padStart(2,"0");
    }
  }

  function renderSchList(){
    const list = $("#schList");
    if (!list) return;
    const items = getFilteredSchedule();
    const lang = state.lang;
    const tagLabel = t().schedule.tags;

    $("#schCount").textContent = items.length;

    if (!items.length){
      list.innerHTML = `<p class="sch-empty">${escapeHTML(t().schedule.empty)}</p>`;
      return;
    }

    list.innerHTML = items.map(s => {
      const d = new Date(s.date + "T00:00:00");
      const month = String(d.getMonth()+1).padStart(2,"0");
      const day   = String(d.getDate()).padStart(2,"0");
      const wd    = (lang==="jp" ? WD_JP : WD_EN)[d.getDay()];
      const wdCls = d.getDay()===0 ? "sun" : d.getDay()===6 ? "sat" : "";
      const title = lang==="jp" ? s.title_jp : s.title_en;
      const venue = lang==="jp" ? s.venue_jp : s.venue_en;
      const artist = (window.DS_DATA.artists.find(a=>a.id===s.artist) || null);
      const artistName = artist ? (lang==="jp"?artist.name_jp:artist.name_en) : "";

      return `
        <article class="sch-item reveal">
          <div class="sch-item__date">
            <span class="ym">${d.getFullYear()}.${month}</span>
            <span class="d">${day}</span>
            <span class="wd ${wdCls}">${wd}</span>
          </div>
          <span class="sch-item__tag" data-tag="${s.tag}">${escapeHTML(tagLabel[s.tag] || s.tag)}</span>
          <div class="sch-item__main">
            <h3 class="sch-item__title">${escapeHTML(title)}</h3>
            <div class="sch-item__meta">
              ${artistName ? `<span class="artist">${escapeHTML(artistName)}</span>` : ""}
              <span>📍 ${escapeHTML(venue || "")}</span>
            </div>
          </div>
          <div class="sch-item__time">${escapeHTML(s.time || "")}</div>
        </article>`;
    }).join("");
  }

  function renderSchCal(){
    const cal = $("#schCal");
    if (!cal) return;
    if (state.sch.view !== "cal"){ cal.hidden = true; return; }
    cal.hidden = false;

    if (state.sch.showAllMonths){
      // when "ALL" is active, default cal to current calendar month
      const now = new Date();
      state.sch.year = now.getFullYear();
      state.sch.month = now.getMonth();
      state.sch.showAllMonths = false;
      renderSchMonth();
    }

    const y = state.sch.year, m = state.sch.month;
    const first = new Date(y, m, 1);
    const startWd = first.getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const items = getFilteredSchedule();
    const byDay = {};
    items.forEach(it => {
      const d = new Date(it.date + "T00:00:00");
      if (d.getFullYear() === y && d.getMonth() === m){
        const k = d.getDate();
        (byDay[k] = byDay[k] || []).push(it);
      }
    });
    const today = new Date();
    const isToday = (yy, mm, dd) => yy===today.getFullYear() && mm===today.getMonth() && dd===today.getDate();

    const wd = (state.lang==="jp" ? WD_JP : WD_EN);

    let html = `<div class="sch-cal__grid">${
      wd.map(w => `<div class="sch-cal__wd">${w}</div>`).join("")
    }`;

    for (let i=0; i<startWd; i++){
      const dd = prevDays - startWd + i + 1;
      html += `<div class="sch-cal__day is-other"><span>${dd}</span></div>`;
    }
    for (let d=1; d<=daysInMonth; d++){
      const evs = byDay[d] || [];
      const dotsHtml = evs.slice(0,4).map(e => `<span class="sch-cal__dot" data-tag="${e.tag}"></span>`).join("");
      const cls = ["sch-cal__day"];
      if (isToday(y,m,d)) cls.push("is-today");
      html += `<div class="${cls.join(" ")}" data-day="${d}">
        <span>${d}</span>
        ${dotsHtml ? `<div class="sch-cal__day-dots">${dotsHtml}</div>` : ""}
        ${evs.length>4 ? `<span class="sch-cal__count">+${evs.length-4}</span>` : ""}
      </div>`;
    }
    const totalCells = startWd + daysInMonth;
    const trail = (7 - (totalCells % 7)) % 7;
    for (let i=1; i<=trail; i++){
      html += `<div class="sch-cal__day is-other"><span>${i}</span></div>`;
    }
    html += `</div>`;
    cal.innerHTML = html;
  }

  function renderSchAll(){
    renderSchList();
    renderSchCal();
    setupReveal();
  }

  function setupScheduleSearch(){
    // initial month: if any item this month, use today; else use first available month
    const now = new Date();
    state.sch.year = now.getFullYear();
    state.sch.month = now.getMonth();
    state.sch.showAllMonths = true;

    renderSchTags();
    renderSchArtists();
    renderSchMonth();
    renderSchAll();

    $("#schPrev").addEventListener("click", () => {
      state.sch.showAllMonths = false;
      let m = state.sch.month - 1, y = state.sch.year;
      if (m < 0){ m = 11; y -= 1; }
      state.sch.month = m; state.sch.year = y;
      renderSchMonth(); renderSchAll();
    });
    $("#schNext").addEventListener("click", () => {
      state.sch.showAllMonths = false;
      let m = state.sch.month + 1, y = state.sch.year;
      if (m > 11){ m = 0; y += 1; }
      state.sch.month = m; state.sch.year = y;
      renderSchMonth(); renderSchAll();
    });
    $("#schToday").addEventListener("click", () => {
      const t = new Date();
      state.sch.year = t.getFullYear();
      state.sch.month = t.getMonth();
      state.sch.showAllMonths = false;
      renderSchMonth(); renderSchAll();
    });

    $$("#schedule .sch-view").forEach(b => b.addEventListener("click", () => {
      $$("#schedule .sch-view").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
      state.sch.view = b.dataset.view;
      if (state.sch.view === "list" && !state.sch.showAllMonths){
        // when switching back to list keep the month filter
      }
      renderSchAll();
    }));

    $("#schKeyword").addEventListener("input", e => {
      state.sch.keyword = e.target.value;
      renderSchAll();
    });

    $("#schTagsAll").addEventListener("click", () => {
      state.sch.tags = new Set(TAGS_ALL);
      renderSchTags(); renderSchAll();
    });
    $("#schTagsNone").addEventListener("click", () => {
      state.sch.tags = new Set();
      renderSchTags(); renderSchAll();
    });

    $("#schReset").addEventListener("click", () => {
      state.sch.tags = new Set(TAGS_ALL);
      state.sch.artists = new Set();
      state.sch.keyword = "";
      state.sch.showAllMonths = true;
      $("#schKeyword").value = "";
      renderSchTags(); renderSchArtists(); renderSchMonth(); renderSchAll();
    });

    // calendar day click → filter to that single day's keyword
    document.addEventListener("click", e => {
      const cell = e.target.closest(".sch-cal__day[data-day]");
      if (!cell || cell.classList.contains("is-other")) return;
      const day = +cell.dataset.day;
      const dStr = `${state.sch.year}-${String(state.sch.month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      state.sch.keyword = "";
      $("#schKeyword").value = "";
      state.sch.view = "list";
      $$("#schedule .sch-view").forEach(x => x.classList.toggle("is-active", x.dataset.view==="list"));
      renderSchAll();
      // scroll to first matching item by exact date
      const first = $$(".sch-item").find(el => el.querySelector(".d")?.textContent === String(day).padStart(2,"0"));
      if (first) first.scrollIntoView({ behavior:"smooth", block:"center" });
    });
  }

  /* ---------- render: artists ---------- */
  function renderArtists(){
    const grid = $("#artistGrid");
    if (!grid) return;
    const lang = state.lang;
    grid.innerHTML = window.DS_DATA.artists.map((a, i) => {
      const name = lang==="jp" ? a.name_jp : a.name_en;
      const desc = lang==="jp" ? a.desc_jp : a.desc_en;
      const num = String(i+1).padStart(2,"0");
      return `
        <a class="artist-card reveal" href="${escapeHTML(a.url)}" target="_blank" rel="noopener" style="--bg:${a.color}">
          <div class="artist-card__media">
            <div class="artist-card__img" style="background-image:url('${escapeHTML(a.img)}');"></div>
            <span class="artist-card__tag">${escapeHTML(a.tag)}</span>
            <span class="artist-card__num">No.${num}</span>
            <span class="artist-card__star" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <defs><path id="acp${i}" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"/></defs>
                <text style="font-family:Anton,sans-serif;font-size:13px;letter-spacing:.18em;fill:#0c0a09">
                  <textPath href="#acp${i}" startOffset="0">★ DEARSTAGE · ${escapeHTML(a.tag)} · </textPath>
                </text>
              </svg>
            </span>
          </div>
          <div class="artist-card__body">
            <h3 class="artist-card__name-jp">${escapeHTML(name)}</h3>
            <p class="artist-card__name-en">${escapeHTML(a.name_en)}</p>
            <p class="artist-card__desc">${escapeHTML(desc)}</p>
            <span class="artist-card__more">${escapeHTML(t().artist.more)} <i>→</i></span>
          </div>
        </a>`;
    }).join("");
  }

  /* ---------- render: company ---------- */
  function renderCompany(){
    const list = $("#companyList");
    if (!list) return;
    const c = window.DS_DATA.company;
    const lang = state.lang;
    const rows = lang==="jp" ? [
      ["商号", c.name_jp],
      ["所在地", c.address_jp],
      ["設立", c.founded_jp],
      ["代表取締役", c.ceo_jp],
      ["従業員数", c.employees + "名"],
      ["事業内容", "エンタテインメント制作 / 音楽出版 / イベント・ライブ制作 / マーチャンダイジング"]
    ] : [
      ["Name", c.name_en],
      ["Address", c.address_en],
      ["Founded", c.founded_en],
      ["CEO", c.ceo_en],
      ["Employees", c.employees],
      ["Business", "Entertainment production, music publishing, event/live production, merchandising"]
    ];
    list.innerHTML = rows.map(([k,v]) => `<dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd>`).join("");
  }

  /* ---------- render: footer SNS ---------- */
  function renderFooterSNS(){
    const wrap = $("#ftSns");
    if (!wrap) return;
    const s = window.DS_DATA.social;
    wrap.innerHTML = `
      <a href="${s.twitter}" target="_blank" rel="noopener" aria-label="X / Twitter">X</a>
      <a href="${s.instagram}" target="_blank" rel="noopener" aria-label="Instagram">IG</a>
      <a href="${s.youtube}" target="_blank" rel="noopener" aria-label="YouTube">YT</a>`;
  }

  /* ---------- reveal on scroll ---------- */
  let _revealIO = null;
  function setupReveal(){
    if (!_revealIO){
      _revealIO = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting){
            en.target.classList.add("is-in");
            _revealIO.unobserve(en.target);
          }
        });
      }, { rootMargin:"0px 0px -5% 0px", threshold: 0.01 });
    }
    $$(".reveal:not(.is-in)").forEach(el => {
      // If already in viewport on init, mark immediately so first-paint sections show
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < vh && r.bottom > 0){
        el.classList.add("is-in");
      } else {
        _revealIO.observe(el);
      }
    });
  }

  /* ---------- bind logo image ---------- */
  function setLogo(){
    const logo = window.DS_DATA.logo;
    if (!logo) return;
    const wrap = $(".hd__logo");
    if (wrap){
      const img = new Image();
      img.src = logo;
      img.alt = "DEARSTAGE";
      img.className = "hd__logo-img";
      img.onload = () => {
        wrap.innerHTML = "";
        wrap.appendChild(img);
        wrap.setAttribute("aria-label","DEARSTAGE");
      };
      img.onerror = () => {
        // keep mark bars on failure
      };
    }
    const sp = $(".splash__center");
    if (sp){
      const img = document.createElement("img");
      img.src = logo;
      img.alt = "DEARSTAGE";
      img.className = "splash__logo-img";
      sp.insertBefore(img, sp.firstChild.nextSibling);
    }
    // Footer big logo image
    const ftLogo = $(".ft__logo");
    if (ftLogo){
      ftLogo.innerHTML = `<img src="${logo}" alt="DEARSTAGE" class="ft__logo-img"/>`;
    }
  }

  /* ---------- master render ---------- */
  function renderAll(){
    renderNews();
    renderSchTags();
    renderSchArtists();
    renderSchMonth();
    renderSchAll();
    renderArtists();
    renderCompany();
    renderFooterSNS();
    setupReveal();
  }

  /* ---------- init ---------- */
  function init(){
    const yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();
    const hd = $("#heroDate"); if (hd) hd.textContent = fmtHeroDate();
    setupSplash();
    setLogo();
    applyI18n();
    mountYouTube();
    buildMarquees();
    setupHeroStripTear();
    setupRibbonDraw();
    startRibbonFlow();
    setupHeader();
    setupLang();
    renderAll();
    setupScheduleSearch();
  }

  // Run init now if DOM is parsed; also fall back to DOMContentLoaded.
  // After document.write() (the password gate pathway), readyState is usually
  // already "interactive"/"complete" by the time scripts run, but DOMContentLoaded
  // does not necessarily re-fire — so we call init() directly when possible.
  function runInit(){
    if (window.__DS_INIT_DONE__) return;
    window.__DS_INIT_DONE__ = true;
    try { init(); } catch(e){ console.error("[DS] init failed:", e); }
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", runInit);
    // Safety net in case DOMContentLoaded never fires (post-document.write case)
    setTimeout(runInit, 0);
  } else {
    runInit();
  }
})();
