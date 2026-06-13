# C-1 subscription server-source-of-truth — 適用手順書 (v1.6.0 Sprint 1b)

監査 C-1(`profiles` のサブスク列がクライアント改竄で自己昇格可能)を、
subscription 状態を server source of truth 化して塞ぐ。EF デプロイ・secret 登録・
migration 適用は**すべて人間が手動**で、以下の順序を厳守する。

## コンポーネント
- EF `revenuecat-webhook`(verify_jwt=false): RC イベント受信 → service_role で plan 等更新。
- EF `sync-subscription`(verify_jwt=true): クライアントが JWT で呼ぶ reconcile(RC REST 照会)。
- EF `start-trial`(verify_jwt=true): 7日 Plus trial の single-use server 強制。
- migration `20260614000000`(即適用安全): `revenuecat_events` 台帳 + `profiles.last_seen_app_version`。
- migration `20260614000001`(step A): plan / subscription_status / subscription_updated_at をロック。
- migration `20260614000002`(step B): plan_expires_at / plan_billing_cycle / trial_started_at をロック。

## 適用順序

### 1. secrets 登録(値はここに書かない)
```
supabase secrets set REVENUECAT_WEBHOOK_AUTH=<dashboard で設定する Authorization 値>
supabase secrets set REVENUECAT_REST_API_KEY=<RC dashboard の Secret API key(public SDK key とは別)>
```

### 2. infra migration(即適用可)
```
supabase db push   # 20260614000000 まで(台帳 + last_seen_app_version)
```
※ step A / step B migration はまだ適用しない(下記で個別に)。

### 3. EF デプロイ
```
supabase functions deploy revenuecat-webhook sync-subscription start-trial --project-ref ycjenvbckffljwnekkll
```
config.toml で revenuecat-webhook=verify_jwt false / sync-subscription・start-trial=verify_jwt true は宣言済み。

### 4. RC dashboard 設定
- Integrations → Webhooks: URL `https://ycjenvbckffljwnekkll.supabase.co/functions/v1/revenuecat-webhook`、
  Authorization ヘッダ値 = secrets の `REVENUECAT_WEBHOOK_AUTH` と同一。
- API keys: **Secret** key を発行し `REVENUECAT_REST_API_KEY` に登録(public SDK key は流用しない)。

### 5. webhook 稼働確認
- RC dashboard の "Send test event" → `revenuecat_events` に行が入る / 401 が出ないこと。
- テスト購入(sandbox)→ 該当 profile の `plan` が webhook 経由で更新されること。

### 6. step A 適用(webhook 稼働確認後すぐ・旧 v1.5.0 クライアント安全)
```
# 20260614000001_lock_subscription_columns_step_a.sql を適用
```
検証(authenticated ユーザーの PostgREST):
- `PATCH /rest/v1/profiles?id=eq.<self> {"plan":"pro"}` → **42501 / 403 拒否**。
- `PATCH ... {"display_name":"x"}` → **204 OK**(正規 update は通る)。
- 既存クライアントの体重/目標 sync が止まらないこと(profileSync は plan を SET しないため影響なし)。

### 7. payload 除去版(本 build)を配布 → floor 到達まで待つ
- 本 build は profileSync payload から plan_expires_at / plan_billing_cycle / trial_started_at を除去し、
  起動時に `last_seen_app_version = 2` を stamp する。
- step B 適用前に**必ず**以下が 0 を返すことを確認(0 でなければ適用禁止):
```sql
select count(*) as stragglers
from public.profiles
where deleted_at is null
  and updated_at > now() - interval '30 days'
  and (last_seen_app_version is null or last_seen_app_version < 2);
```

### 8. step B 適用(floor 確認後のみ)
```
# 20260614000002_lock_subscription_columns_step_b.sql を適用
```
検証:
- `PATCH ... {"plan_expires_at":"2099-01-01"}` / `{"trial_started_at":"..."}` → **42501 / 403**。
- profileSync(display_name/体重/目標)が **204 OK** のまま。
- これで 6 列すべて server-only。deriveEffectivePlan の client-push 昇格(expires/trial)も封鎖。

## ⚠️ 危険操作の警告
- **step B を floor 確認前に適用しない**。旧クライアントの profileSync upsert が 42501 →
  MAX_RETRIES=5 で dead-letter → その profile の同期が**恒久停止**(体重・目標も含む)。
- step A/B の GRANT は profiles の非subscription列を**明示列挙**している。将来 profiles に
  非subscription列を ADD する migration は、この GRANT にも列を追記しないとクライアントが
  その列を書けなくなる。

## 昇格不能の最終確認(step A+B 適用後)
authenticated ロールで 6 列いずれの直 UPDATE/INSERT も 42501。service_role(EF)のみが書ける。
旧クライアントの no-op 直書きは握り潰され crash しない(applyCustomerInfoToProfile の内側 try/catch)。

## 運用上の時差(Build 配布前)
step A 適用後〜本 build 配布前は、課金者の plan は webhook(購入/更新イベント)で更新される。
過去に課金済みでイベントが飛ばないユーザーは、本 build 起動時の reconcile か、必要なら
service_role での手動是正(`update public.profiles set plan='pro', subscription_status='active',
subscription_updated_at=now() where id='<auth-uid>';`)で対応。
