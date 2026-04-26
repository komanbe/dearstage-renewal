# DEARSTAGE Renewal

[dearstage.co.jp](https://dearstage.co.jp/) リニューアル版（プロトタイプ）。

## デザイン参照

- 構成: [helloproject.com](https://helloproject.com/)
- 配色: [dspm.jp](https://dspm.jp/)（ピンク × パープル × イエロー × ブラック）
- アニメーション/UI: [avexnet.jp](https://avexnet.jp/)（ブロブカード / ウェーブリボン / 斜めテープマーキー / グレイン背景）
- ファーストビュー背景動画: [YouTube k1-VJqwNNu4](https://www.youtube.com/watch?v=k1-VJqwNNu4)

## ローカルプレビュー

```bash
npm run dev
# → http://localhost:5173/
```

## ビルド（パスワードゲート付き）

```bash
# デフォルトパスワード "dearstage" でビルド
npm run build

# 任意のパスワードでビルド
DS_PASSWORD='your secret password' npm run build
```

`docs/index.html` に AES-GCM-256（PBKDF2-SHA256, 250,000 iter）で暗号化された自己完結型 HTML が出力されます。GitHub Pages の "Deploy from branch: main / `/docs`" 設定でそのまま公開できます。

## 構造

```
.
├── index.html          # 開発用エントリ
├── css/style.css       # 全スタイル
├── js/
│   ├── data.js         # アーティスト・ニュース・スケジュールデータ
│   ├── i18n.js         # JP / EN 翻訳
│   └── main.js         # ロジック（i18n / 言語切替 / スケジュール検索 / アニメ等）
├── scripts/build.mjs   # 暗号化ビルド
└── docs/               # ビルド成果物（GitHub Pages 配信用）
```

## 機能

- スプラッシュイントロ（DEARSTAGEロゴ）
- ヘッダー: ファーストビューでは非表示、スクロールで出現
- ファーストビュー: YouTube 背景動画（埋込不可時はグラデ・フォールバック）
- ニュース、Schedule（Hello! Project 風タグ複数選択 + アーティスト絞り込み + 月送り + キーワード検索 + リスト/カレンダー切替）
- アーティスト: 15組（dearstage.co.jp 画像参照）
- 会社情報、フッター
- JP / EN 言語切替
- StaticCrypt 方式パスワードゲート（`docs/` ビルド時のみ）

## ライセンス

社内利用想定の試作。アーティスト写真等の素材は dearstage.co.jp の公式 URL を直接参照しています。
