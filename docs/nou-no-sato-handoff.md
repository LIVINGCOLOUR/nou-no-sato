# 農の里 引き継ぎメモ

この文書は、次のChatGPT/Codexスレッドにそのまま貼って作業再開できるようにするための引き継ぎです。

## プロジェクト概要

プロジェクト名は「農の里」。

自然農・自然栽培・有機農法・菌ちゃん農法などに関心のある人が、地元で仲間を見つけ、イベントに参加し、農法を学び、自分の畑の記録を残し、在来種・固定種への関心を高めるための地域コミュニティアプリです。

## 正しいローカルパス

```text
C:\Users\HOME\nou-no-sato
```

## 正しいGitHub repo

```text
https://github.com/LIVINGCOLOUR/nou-no-sato
```

remote URLは以下であること。

```text
https://github.com/LIVINGCOLOUR/nou-no-sato.git
```

## `kotoba` とは別プロジェクトである注意

「農の里」は `kotoba` とは完全に別プロジェクトです。

以前、誤って `kotoba` リポジトリ内に `nou-no-sato/` として作成し、`kotoba` 側にPRを作った経緯があります。そのPRはmergeせずcloseしました。

今後は `kotoba` のPR、ブランチ、履歴を「農の里」の正本として扱わないでください。必ず `C:\Users\HOME\nou-no-sato` と `LIVINGCOLOUR/nou-no-sato` を使ってください。

## 現在の実装状態

- Phase 1静的UIプロトタイプです。
- repo直下に `index.html` があります。
- CSSは `css/styles.css` です。
- JavaScriptは `js/main.js` です。
- ダミーデータは `data/mock-data.js` です。
- 画像素材はまだ本物を使わず、CSSグラデーションと仮ビジュアルで表現しています。
- `assets/README.md` と `docs/README.md` があります。
- root `README.md` もあります。

## 決定済み方針

- 中心価値は、地元の仲間、リアルイベント、農法学習、畑ノート、在来種・固定種への関心です。
- AI相談は主役にしません。
- Q&A掲示板中心の設計にしません。
- DM、リアルタイムチャット、ランキング、農産物販売はPhase 1では作りません。
- 畑ノートは基本非公開です。
- 仲間探しでは本名、詳細住所、畑の正確な場所を出しません。
- 農法比較では優劣をつけません。
- 参考画像や外部サイトの画像を直接コピーしません。

## Phase 1の範囲

作るもの:

- ホーム
- 地元の仲間を探す
- イベントを見る
- 農法を学ぶ
- 畑ノートを記録する
- 在来種マップを見る
- マイページ簡易イメージ
- スマホ向け下部ナビ

作らないもの:

- ログイン
- ユーザー登録
- DB/API
- 投稿保存
- AI相談
- Q&A掲示板中心の体験
- DM/チャット
- ランキング
- 課金
- 農産物販売
- SNS投稿

## 現在の未確認事項

- 初期対象地域の確定。
- 運営登録イベントの掲載フロー。
- 在来種・固定種データの情報源。
- スマホ実機での表示確認。
- 画像素材を使う場合の撮影・権利確認方針。
- 将来の畑ノート共有範囲。
- GitHub Pages等でデモ公開するかどうか。

## 次にCodexへ依頼すべき作業

次回は、以下のどれかを小さく依頼するのがよいです。

1. スマホ実機確認を前提にしたUI微調整。
2. 農法比較セクションの中立性レビューと文言調整。
3. 畑ノート非公開方針がより伝わるUI調整。
4. イベントカードの情報量整理。
5. GitHub Pagesで静的デモを公開する準備。
6. Phase 2のバックエンド候補をdocsに整理。

## 触ってはいけないもの

- `kotoba` リポジトリ。
- `kotoba` のPRやブランチ。
- Phase 1範囲外のDB/API/ログイン/認証。
- AI相談、DM、リアルタイムチャット、ランキング、販売機能。
- 外部画像や参考画像の直接コピー。

## 最新の確認コマンド

作業開始時は必ず以下を確認してください。

```powershell
Set-Location C:\Users\HOME\nou-no-sato
Get-Location
git remote -v
git branch --show-current
git status --short
git log --oneline -5
```

remote URLが `https://github.com/LIVINGCOLOUR/nou-no-sato.git` ではない場合、作業を停止してください。

構文確認:

```powershell
node --check .\js\main.js
node --check .\data\mock-data.js
```

ローカル表示確認:

```powershell
python -m http.server 8000
```

```text
http://localhost:8000/index.html
```

## 画面遷移設計

- 画面遷移設計は `docs/nou-no-sato-screen-transition.md` に整理しています。
- Mermaid図は `docs/nou-no-sato-screen-flow.mmd` です。
- ブラウザ確認用の静的図は `docs/nou-no-sato-screen-flow.html` です。
