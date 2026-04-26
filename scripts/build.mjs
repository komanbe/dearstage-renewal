#!/usr/bin/env node
/**
 * DEARSTAGE Renewal — Static encryption build (StaticCrypt-style)
 *
 * 1. Reads index.html + css/style.css + js/data.js + js/i18n.js + js/main.js
 * 2. Inlines them into a single HTML body
 * 3. Encrypts that body with AES-GCM, key derived from a password via PBKDF2-SHA256
 * 4. Emits docs/index.html — a self-contained password gate that decrypts & renders
 *
 * Usage:
 *   node scripts/build.mjs                     # uses DS_PASSWORD env or default 'dearstage'
 *   DS_PASSWORD='your password' node scripts/build.mjs
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs");

const PBKDF2_ITER = 250000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const PASSWORD = process.env.DS_PASSWORD || "dearstage";

const read = (p) => readFile(join(ROOT, p), "utf8");

function inlineSrc(html, replacements){
  let out = html;
  for (const [needle, replacement] of replacements){
    out = out.replace(needle, replacement);
  }
  return out;
}

async function deriveKey(password, salt){
  const enc = new TextEncoder();
  const baseKey = await webcrypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(plaintext, password){
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv   = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key  = await deriveKey(password, salt);
  const enc  = new TextEncoder();
  const ct   = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, enc.encode(plaintext)
  ));
  // package: [salt(16) | iv(12) | ciphertext]
  const out = new Uint8Array(salt.length + iv.length + ct.length);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(ct, salt.length + iv.length);
  return Buffer.from(out).toString("base64");
}

const GATE_TEMPLATE = ({ b64payload, iter }) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>DEARSTAGE</title>
<meta name="robots" content="noindex,nofollow">
<style>
  *,*::before,*::after{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; height:100%; }
  body{
    font-family: "Anton", "Bebas Neue", "Noto Sans JP", system-ui, sans-serif;
    background:#0c0a09; color:#fff;
    display:flex; align-items:center; justify-content:center; padding:24px;
    overflow:hidden;
  }
  .gate{ width: min(440px, 96vw); text-align:center; position: relative; z-index:1; }
  .gate__brand{
    font-size: 48px; letter-spacing:.04em; line-height:.9;
    margin: 0 0 6px;
    background: linear-gradient(135deg, #ff2d8e, #ffe600, #9d3cff);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .gate__sub{ font-size: 11px; letter-spacing:.4em; color: rgba(255,255,255,.6); margin: 0 0 36px; }
  .gate__form{ display:flex; gap:8px; }
  .gate__input{
    flex:1; padding: 14px 18px;
    background: rgba(255,255,255,.05);
    border: 1.5px solid rgba(255,255,255,.18);
    border-radius: 999px;
    color: #fff; font-size: 14px; letter-spacing: .12em;
    outline: none; font-family: inherit;
  }
  .gate__input:focus{ border-color: #ff2d8e; }
  .gate__btn{
    padding: 14px 22px; border-radius: 999px;
    background: #ff2d8e; color:#0c0a09; border:0;
    font-size: 12px; letter-spacing: .25em; font-weight:800; cursor:pointer;
    font-family: inherit;
  }
  .gate__btn:hover{ background:#ffe600; }
  .gate__err{
    margin-top: 14px; font-size: 11px; letter-spacing: .2em;
    color: #ff6ec7; min-height: 14px; opacity:0; transition: opacity .25s ease;
  }
  .gate__err.is-show{ opacity:1; }
  .gate__bg{
    position: fixed; inset: -10%; pointer-events:none; z-index:0;
    background:
      radial-gradient(50% 50% at 25% 30%, rgba(255,45,142,.55), transparent 60%),
      radial-gradient(40% 40% at 75% 70%, rgba(157,60,255,.55), transparent 60%);
    filter: blur(80px); animation: gateBg 18s ease-in-out infinite alternate;
  }
  @keyframes gateBg{ to { transform: translate(40px, -30px) scale(1.05); } }
  .gate__noise{
    position: fixed; inset:0; pointer-events:none; z-index:2; opacity:.15;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }
</style>
</head>
<body>
<div class="gate__bg"></div>
<div class="gate__noise"></div>
<form class="gate" id="gate" autocomplete="off">
  <h1 class="gate__brand">DEARSTAGE</h1>
  <p class="gate__sub">PROTECTED PREVIEW</p>
  <div class="gate__form">
    <input class="gate__input" id="pw" type="password" placeholder="Password" autocomplete="current-password" autofocus>
    <button class="gate__btn" type="submit">UNLOCK</button>
  </div>
  <p class="gate__err" id="err">INCORRECT PASSWORD</p>
</form>

<script>
(function(){
  const PAYLOAD_B64 = ${JSON.stringify(b64payload)};
  const ITER = ${iter};
  const SALT_BYTES = ${SALT_BYTES};
  const IV_BYTES = ${IV_BYTES};

  const b64ToBytes = (s) => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i=0; i<bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  async function deriveKey(pw, salt){
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(pw), { name:"PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name:"PBKDF2", salt, iterations: ITER, hash:"SHA-256" },
      base,
      { name:"AES-GCM", length: 256 },
      false, ["decrypt"]
    );
  }

  async function tryDecrypt(pw){
    const buf = b64ToBytes(PAYLOAD_B64);
    const salt = buf.slice(0, SALT_BYTES);
    const iv   = buf.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const ct   = buf.slice(SALT_BYTES + IV_BYTES);
    const key  = await deriveKey(pw, salt);
    const pt   = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  const form = document.getElementById("gate");
  const pwInput = document.getElementById("pw");
  const errEl = document.getElementById("err");

  // Try saved key
  const saved = sessionStorage.getItem("ds_pw");
  if (saved){
    tryDecrypt(saved).then(html => render(html)).catch(()=>{});
  }

  function flashErr(){
    errEl.classList.add("is-show");
    pwInput.value = ""; pwInput.focus();
    setTimeout(()=>errEl.classList.remove("is-show"), 2000);
  }

  function render(html){
    sessionStorage.setItem("ds_pw", pwInput.value || saved);
    document.open();
    document.write(html);
    document.close();
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const pw = pwInput.value;
    try {
      const html = await tryDecrypt(pw);
      render(html);
    } catch(_) {
      flashErr();
    }
  });
})();
</script>
</body>
</html>
`;

async function build(){
  console.log("[build] Reading source files…");
  const html = await read("index.html");
  const css  = await read("css/style.css");
  const dataJs = await read("js/data.js");
  const i18nJs = await read("js/i18n.js");
  const mainJs = await read("js/main.js");

  console.log("[build] Inlining CSS / JS…");
  const inlined = inlineSrc(html, [
    [/<link\s+rel="stylesheet"\s+href="\.\/css\/style\.css">/i, `<style>\n${css}\n</style>`],
    [/<script\s+src="\.\/js\/data\.js"><\/script>/i, `<script>\n${dataJs}\n</script>`],
    [/<script\s+src="\.\/js\/i18n\.js"><\/script>/i, `<script>\n${i18nJs}\n</script>`],
    [/<script\s+src="\.\/js\/main\.js"><\/script>/i, `<script>\n${mainJs}\n</script>`]
  ]);

  console.log(`[build] Encrypting payload (PBKDF2 iter=${PBKDF2_ITER}, AES-GCM-256)…`);
  const b64payload = await encrypt(inlined, PASSWORD);

  console.log("[build] Writing docs/index.html…");
  await mkdir(OUT_DIR, { recursive: true });
  const gate = GATE_TEMPLATE({ b64payload, iter: PBKDF2_ITER });
  await writeFile(join(OUT_DIR, "index.html"), gate, "utf8");

  // .nojekyll so GitHub Pages doesn't strip files starting with _
  await writeFile(join(OUT_DIR, ".nojekyll"), "", "utf8");

  console.log("[build] Done.");
  console.log(`        Output : docs/index.html`);
  console.log(`        Size   : ${(gate.length / 1024).toFixed(1)} KB`);
  console.log(`        Password: ${PASSWORD === "dearstage" ? "(default: dearstage — change with DS_PASSWORD env)" : "(custom)"}`);
}

build().catch(err => {
  console.error("[build] FAILED:", err);
  process.exit(1);
});
