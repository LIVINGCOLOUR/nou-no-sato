# 農の里 現在状態

## プロジェクト名

農の里

## アプリの目的

自然農・自然栽培・有機農法・菌ちゃん農法などに関心のある人が、地元でゆるく仲間を見つけ、リアルイベントに参加し、農法を学び、自分の畑の記録を残し、在来種・固定種への関心を高めるための地域コミュニティアプリです。

## Phase 1の位置づけ

Phase 1は、バックエンド実装前に画面構成、主要導線、UIの雰囲気、プロダクト方針を確認するための静的UIプロトタイプです。

現時点ではDB、API、ログイン、認証、投稿保存などの本番機能はありません。

## 現在の実装状態

- 静的HTML/CSS/JavaScriptで構成されています。
- `index.html` はアプリシェルで、hash routingにより複数画面を静的に切り替えます。
- `data/mock-data.js` に画面表示用のダミーデータがあります。
- `js/main.js` がルーティングと各画面の描画を担当します。
- ホーム、仲間一覧、イベント一覧/詳細、農法一覧/詳細、畑ノート一覧/作成、在来種マップ/詳細、マイページを表示できます。
- 画像素材は外部コピーではなく、`assets/visuals/hero-satoyama.jpg` とCSS表現で構成しています。
- スマホ向け下部ナビがあります。

## 現在のファイル構成

```text
.
├─ index.html
├─ README.md
├─ assets/
│  └─ README.md
├─ css/
│  └─ styles.css
├─ data/
│  └─ mock-data.js
├─ docs/
│  ├─ README.md
│  ├─ nou-no-sato-current-state.md
│  ├─ nou-no-sato-decisions.md
│  ├─ nou-no-sato-clickable-prototype.md
│  ├─ nou-no-sato-screen-transition.md
│  ├─ nou-no-sato-screen-flow.mmd
│  ├─ nou-no-sato-screen-flow.html
│  ├─ nou-no-sato-todo.md
│  └─ nou-no-sato-handoff.md
└─ js/
   └─ main.js
```

## ローカル確認方法

リポジトリ直下で以下を実行します。

```bash
python -m http.server 8000
```

ブラウザで以下を開きます。

```text
http://localhost:8000/index.html
```

クリック可能プロトタイプの開始URL:

```text
http://localhost:8000/index.html#/home
```

JavaScript構文確認は以下です。

```bash
node --check js/main.js
node --check data/mock-data.js
```

## GitHub repo URL

https://github.com/LIVINGCOLOUR/nou-no-sato

## 現在のbranch / commit

- Branch: `main`
- 実装初回commit: `a554482 Create Nou no Sato phase 1 UI prototype`
- この文書追加後は、最新commitを `git log --oneline -1` で確認してください。

## 既知の注意点

- このリポジトリは `kotoba` とは別プロジェクトです。
- 以前 `kotoba` リポジトリ内に `nou-no-sato/` として作成した経緯がありますが、今後はこの独立リポジトリを正本として扱います。
- `kotoba` のPR、ブランチ、履歴を「農の里」の正本として扱わないでください。
- Phase 1では畑ノートは基本非公開です。
- 仲間探しでは本名、詳細住所、畑の正確な場所を前面に出しません。
- 農法比較は優劣づけではなく、考え方や条件の違いを理解するためのものです。
- 参考画像や外部サイト画像の素材を直接コピーしていません。
