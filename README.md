# ミーリフト (MealLift)

筋トレ・栄養管理アプリ

## セットアップ

```bash
npm install
npx expo start
```

## 環境変数

`.env.example` を `.env` にコピーして、Supabase の URL と Anon Key を設定してください。

```bash
cp .env.example .env
```

## AI栄養推定のセットアップ

AI栄養推定機能は Supabase Edge Function 経由で Gemini API を呼び出します。

### 1. Supabase CLI をインストール

```bash
npm install -g supabase
```

### 2. Edge Function をデプロイ

```bash
supabase functions deploy estimate-nutrition
supabase functions deploy nutrition-advice
```

### 3. Gemini APIキーを Supabase の環境変数に設定

```bash
supabase secrets set GEMINI_API_KEY=あなたのGemini APIキー
```

APIキーは [Google AI Studio](https://aistudio.google.com/apikey) で無料で作成できます。

## アプリ内課金 (RevenueCat)

`react-native-purchases` を使用して App Store のサブスクリプションを RevenueCat 経由で処理します。

### 制約

- **Expo Go では動作しません**。`react-native-purchases` はネイティブコードを含むため、EAS Build で作成した Dev Client または本番ビルドが必要です。
- 現在は **iOS のみ対応**（Android は API キー未設定のため自動的にスキップされます）。

### 1. API キーを `.env` に設定

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_xxxxxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=  # 当面空でOK
```

公開 SDK キーは [RevenueCat Dashboard](https://app.revenuecat.com/) → Project Settings → API Keys から取得できます。

### 2. iOS Capability

Apple Developer 側の App ID と Xcode プロジェクトに **In-App Purchase** capability を有効化してください。EAS Build を使う場合は `eas.json` の `ios.entitlements` に以下を追加するだけで自動付与されます（capabilities は App Store Connect 側で事前に有効化しておく必要あり）:

```json
{
  "build": {
    "production": {
      "ios": { "entitlements": { "com.apple.developer.in-app-payments": [] } }
    }
  }
}
```

### 3. Dev Client をビルド

```bash
eas build --profile development --platform ios
```

生成された `.ipa` を実機にインストールして `expo start --dev-client` で接続します。

### 4. Sandbox テスト手順

1. App Store Connect → ユーザーとアクセス → Sandbox テスター でテスト用 Apple ID を作成
2. 実機の 設定 → App Store → Sandbox アカウント にそのアカウントでサインイン（本番の Apple ID とは別）
3. Dev Client を起動 → 設定 → プラン画面で購入ボタンをタップ
4. Sandbox 課金ダイアログが表示されたら承認（実際の課金は発生しない）
5. 購入後、`entitlements.active.pro` または `plus` が返ることを確認
6. 「購入を復元」ボタンでの復元も同じ Apple ID で動作すること
7. RevenueCat Dashboard → Customer History にイベントが記録されるか確認

### 5. 製品 ID の命名規則

`src/infra/services/revenueCatService.ts` の `findPackage()` は以下の Package 識別子を期待します（RevenueCat ダッシュボードの Package 設定と一致させてください）:

- `plus_monthly` / `plus_halfyear` / `plus_annual`
- `pro_monthly` / `pro_halfyear` / `pro_annual`

