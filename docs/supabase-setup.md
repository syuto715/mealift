# Supabase Dashboard 手動設定

このドキュメントは、リリース時に Supabase ダッシュボードで実施する必要のある手動設定を記載する。

リポジトリのコード変更だけでは反映されない。`syuto715` が実施する。

---

## 1. Auth → URL Configuration（最重要：認証メール redirect 修正）

`Authentication` → `URL Configuration` を開き、以下を設定する：

| Field | Value |
|---|---|
| Site URL | `mealift://` |
| Redirect URLs（複数行で追加） | `mealift://auth/callback`<br>`mealift://**`<br>`exp://**`（Expo Go での開発確認用） |

> **なぜこれが重要か**: アプリのコードは `signUp` 呼び出し時に `emailRedirectTo: 'mealift://auth/callback'` を渡す。Supabase はこの URL が **Redirect URLs に allow-list されていなければ拒否し、Site URL（= デフォルト）にフォールバックする**。`localhost` のままだと確認メールリンクは `localhost` を指し、ユーザーは認証完了できない。

設定後、**ダッシュボードの "Save changes" を必ずクリック**すること。

---

## 2. Auth → Email Templates（日本語化）

`Authentication` → `Email Templates` で 4 つのテンプレートを編集する。

### 2-1. Confirm signup

**Subject:**
```
ミーリフト：メールアドレスの確認
```

**Body (HTML):**
```html
<h2>ミーリフトへようこそ</h2>

<p>ご登録ありがとうございます。下のリンクをタップして、メールアドレスの確認を完了してください。</p>

<p><a href="{{ .ConfirmationURL }}">メールアドレスを確認する</a></p>

<p style="color: #666; font-size: 12px; margin-top: 30px;">
このメールに心当たりがない場合は、無視してください。<br>
ミーリフト運営チーム
</p>
```

### 2-2. Reset Password

**Subject:**
```
ミーリフト：パスワードの再設定
```

**Body (HTML):**
```html
<h2>パスワードの再設定</h2>

<p>パスワード再設定のリクエストを受け付けました。下のリンクをタップして、新しいパスワードを設定してください。</p>

<p><a href="{{ .ConfirmationURL }}">パスワードを再設定する</a></p>

<p style="color: #666; font-size: 12px; margin-top: 30px;">
このメールに心当たりがない場合は、無視してください。アカウントは安全な状態のままです。<br>
ミーリフト運営チーム
</p>
```

### 2-3. Magic Link

**Subject:**
```
ミーリフト：ログインリンク
```

**Body (HTML):**
```html
<h2>ミーリフトへログイン</h2>

<p>下のリンクをタップしてログインしてください。リンクの有効期限は 1 時間です。</p>

<p><a href="{{ .ConfirmationURL }}">ログインする</a></p>

<p style="color: #666; font-size: 12px; margin-top: 30px;">
このメールに心当たりがない場合は、無視してください。<br>
ミーリフト運営チーム
</p>
```

### 2-4. Change Email Address

**Subject:**
```
ミーリフト：メールアドレス変更の確認
```

**Body (HTML):**
```html
<h2>メールアドレス変更の確認</h2>

<p>新しいメールアドレスへの変更リクエストを受け付けました。下のリンクをタップして、変更を確定してください。</p>

<p><a href="{{ .ConfirmationURL }}">新しいメールアドレスを確認する</a></p>

<p style="color: #666; font-size: 12px; margin-top: 30px;">
このメールに心当たりがない場合は、無視してください。<br>
ミーリフト運営チーム
</p>
```

---

## 3. 設定後の動作確認チェックリスト

1. ✅ 新規ユーザーでサインアップ → 登録メールが届く
2. ✅ 件名・本文が日本語になっている
3. ✅ メール内のリンクが `mealift://auth/callback?code=…` の形式である（`localhost` でない）
4. ✅ iOS 実機でリンクをタップ → アプリが起動する
5. ✅ アプリが「メール認証を確認しています…」を表示後、ホーム画面に遷移する
6. ✅ 期限切れ / 無効なリンクをタップした場合、ログイン画面に戻る + エラートースト

---

## 4. 既知の制約

- **Universal Links（独自ドメイン）は未対応**: 現状は custom URL scheme のみ。ドメイン取得 + `apple-app-site-association` 設置を行えば将来的に切り替え可能。
- **Expo Go での確認**: 本番ビルドでは `mealift://` を使うが、Expo Go では `exp://192.168.x.x:8081/--/auth/callback` 形式になる。この URL も Redirect URLs に許可しているので開発時もテスト可能。
- **OTA は未設定**: `expo-updates` は未導入のため、認証フローの修正は新ビルド（build 10）の App Store 提出が必要。Build 9 のユーザーには反映されない。
