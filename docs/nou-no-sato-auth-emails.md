# 認証メールのテンプレート（Supabase）

設定場所: ダッシュボード → Authentication → Emails（Templates）
https://supabase.com/dashboard/project/msnjnyfncnismoxpgndh/auth/templates

デフォルトは英語（差出人 Supabase Auth／件名 Confirm your email address）でスパムと誤解されるため、日本語化した。`{{ .ConfirmationURL }}` は差し込み変数なのでそのまま残すこと。

## Magic Link（2回目以降のログイン）

Subject:

```
【農の里（仮称）】ログイン用リンクです
```

Body:

```html
<h2>農の里（仮称）へのログイン</h2>
<p>下のリンクを開くと、ログインが完了します（リンクの有効期限は1時間です）。</p>
<p><a href="{{ .ConfirmationURL }}">農の里（仮称）にログインする</a></p>
<p>心当たりがない場合は、このメールは破棄してください。リンクを開かない限り何も起こりません。</p>
<p>— 農の里（仮称）｜自然な農業・在来種の地域コミュニティ</p>
```

## Confirm signup（初回登録）

Subject:

```
【農の里（仮称）】メールアドレスの確認
```

Body:

```html
<h2>農の里（仮称）へようこそ</h2>
<p>下のリンクを開くと、メールアドレスの確認とログインが完了します。</p>
<p><a href="{{ .ConfirmationURL }}">メールアドレスを確認してログインする</a></p>
<p>心当たりがない場合は、このメールは破棄してください。</p>
<p>— 農の里（仮称）｜自然な農業・在来種の地域コミュニティ</p>
```

## 差出人（From）の変更について

- 内蔵メールでは差出人（Supabase Auth / noreply@mail.app.supabase.io）は変更できない。
- 変更には独自SMTPが必要（Authentication → SMTP Settings）。候補: Resend（月3,000通無料・独自ドメイン必須）。
- 正式名称と独自ドメインが決まったタイミングで設定する。送信レート緩和（内蔵は1時間あたり数通）とスパム判定対策を兼ねる。
- アプリ名変更（仮称→正式名称）の際は、このテンプレートも一括更新すること。
