# OTA アップデート（EAS Update）

ストア再審査なしで JS / アセットの修正をユーザーに配信するための仕組み。Build 10 から有効。

## 仕組み

- ビルドは起動時に `https://u.expo.dev/<projectId>` をチェックし、同じ `runtimeVersion` の新しい bundle があればダウンロードして次回起動から適用する
- `runtimeVersion: { policy: "appVersion" }` のため、同じ `version`（例 `1.0.0`）で動いているバイナリだけが OTA を受け取る
- ネイティブの変更（依存追加、Info.plist、ヘッダー、permissions など）は OTA では配信できない → 新ビルド + ストア提出が必要

## チャンネル

| eas.json profile | EAS Update channel | 用途 |
|---|---|---|
| `production` | `production` | App Store ビルド向け |
| `preview` | `preview` | TestFlight / 社内配布向け |
| `development` | （なし） | dev client は OTA を購読しない |

## 緊急 hotfix の手順

1. `main` で修正をコミット（JS 変更のみ）
2. `tsc` clean + `jest` グリーン確認
3. `npx eas update --branch production --message "<日本語の簡潔な説明>"`
4. 数分以内に既存ユーザーへ自動配信される
5. `npx eas update:list --branch production` で配信状況を確認

## ロールバック

問題のある OTA を出してしまった場合：

```bash
npx eas update:list --branch production
# 直前の "正常な" update ID を控える
npx eas update:republish --group <UPDATE_GROUP_ID>
```

`republish` は古い bundle を新しい update として再公開する。差分が小さいので即時適用される。

## ネイティブ変更を含む場合（OTA 不可）

以下を変更したら新ビルドが必要：

- `package.json` に新しいネイティブ依存（`react-native-*`、`expo-*` の一部）
- `app.config.ts` の `plugins`、`ios.infoPlist`、`android.permissions`
- `version`（=`runtimeVersion`）の手動 bump
- `assets/icon.png` などのネイティブ埋め込みアセット

`npx eas build --platform ios --profile production` → `npx eas submit` の通常フロー。

## トラブルシュート

- **OTA が届かない**: ビルドの `runtimeVersion` と公開済み update の `runtimeVersion` を一致させる必要がある。`eas update:list --branch production` で確認
- **古い bundle が表示される**: Expo Go や開発クライアントは OTA を購読しない。本番ビルドで確認する
- **公開を取り下げたい**: `eas update:roll-back-to-embedded` で組み込み bundle に戻せる

## 参考

- [EAS Update docs](https://docs.expo.dev/eas-update/introduction/)
- プロジェクト ID: `22e7739f-d13b-4080-b8ec-d2943e71767d`
