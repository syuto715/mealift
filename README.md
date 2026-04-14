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
