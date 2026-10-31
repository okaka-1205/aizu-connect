# 改善一式の本番反映記録

2026年10月30日21:45（日本時間）、未反映だった改善を本番へデプロイした。公開URLは [Aizu Connect](https://aizu-connect-prod.web.app/)。

## 反映対象

- Firebaseプロジェクト：`aizu-connect-prod`
- Firebase Hosting：依存関係・遅延読み込みの整理、重複処理の共通化、検索・チャット・アンケート・管理画面の改善、大きな画面の責務分割と型チェック強化を含む検証済みビルド45ファイル。
- Firestore Rules：有効かつメール確認済みの学生主催者が、自分のイベントのアンケート結果を閲覧できるようにする変更。他のイベントの結果取得は引き続き拒否する。
- 今回の検証で再現した、一覧更新と詳細画面を閉じる操作の競合も修正した。閉じる際にURLのイベント指定を先に解除し、古い指定からの再表示を防ぐ。

Functionsの本番コード、Storage Rules、Firestoreインデックスは差分がないためデプロイ対象に含めていない。データ移行は行っていない。

## リリース前の検証

`CI=true npm run release:check` が終了コード0で完了した。

| 検証                                                | 結果      |
| --------------------------------------------------- | --------- |
| フロントエンド・FunctionsのLint／型チェック／ビルド | 成功      |
| フロントエンド単体テスト・本番App Check設定テスト   | 69件成功  |
| Functions単体テスト                                 | 29件成功  |
| Firestore・Storage権限テスト                        | 40件成功  |
| 認証画面・モバイル表示・画面遷移                    | 25件成功  |
| 登録・認証                                          | 20件成功  |
| 管理者承認の同期                                    | 5件成功   |
| 学生・主催者・管理者の主要操作                      | 135件成功 |
| アクセシビリティ                                    | 55件成功  |
| 定期処理・大量データ処理・管理者を保持する削除処理  | 成功      |

ブラウザーテストは合計240件。画面遷移の回帰テストは修正前に失敗することを確認し、修正後は5環境で成功した。前回失敗していたモバイルの詳細画面終了、WebKitの参加申請・退会申請も最終検証では成功した。最終実行には失敗・flakyの報告はなかった。権限変更の評価範囲と根拠は[今回の差分に限定したRules監査](./release-rules-audit-2026-10-30.json)を参照。

## デプロイと公開後の確認

デプロイコマンド：

```sh
./scripts/run-with-node24.sh npx -y firebase-tools@latest deploy --only hosting,firestore:rules --project aizu-connect-prod --non-interactive
```

- Hostingの新バージョン：`sites/aizu-connect-prod/versions/a03d2b0656f5f985`
- Hostingリリース：`sites/aizu-connect-prod/releases/1793364303890000`
- Firestoreの新Ruleset：`projects/aizu-connect-prod/rulesets/d15fb32c-d4aa-434d-90dd-9e9f0889b430`
- 公開ファイル45件すべてのHTTP 200とSHA-256の一致を確認した。トップページも検証済みの`index.html`と一致。
- トップページのキャッシュ制御とセキュリティヘッダーを確認した。
- 本番に適用されたFirestore Rulesはローカルの検証済みファイルと一致した。
- 公開Functionsのヘルスチェックは`status: ok`。
- PC・スマートフォン相当のブラウザーで、新規登録画面からログイン画面への切り替え、遅延読み込みされる規約本文の表示、Escapeでの終了を確認。未処理のJavaScript例外・配信アセットの取得エラーはいずれも0件。

本番での確認は公開画面と読み取りに限定した。登録・申込・退会などの書き込みを伴う導線はエミュレーターで検証しており、本番のメール配送・実機MFA・実機QR読み取りの確認結果を意味しない。

## ソース識別と切り戻し先

基準コミットは`3e1f1b0bb8242075fc04f178d32781bf8cb32a77`。今回のリリースには未コミットの作業ツリーの改善を含むため、このコミット単独から作ったビルドではない。検証開始後からデプロイ直前までソース・ビルドのハッシュが変わっていないことを確認した。

- ソース119ファイルの指紋：`8fe1c71ca3676f404ddbb73c7b524fac7277b31dd52148ef10fb2d0183d71cee`（パス順の`{path, sha256}`配列をJSON化したSHA-256）。
- 公開`index.html`のSHA-256：`f310c7ff2322c1c94a3ff3fd8062156eecf86daced826070bb62de2ee88f94eb`
- 適用後RulesのSHA-256：`fcf806e6f1d7dd46441705f58237194e021c7a2cf07b5f93f3b27b4b6a0dec78`
- 直前のHostingバージョン：`sites/aizu-connect-prod/versions/90a6ef8f023190ba`
- 直前のFirestore Ruleset：`projects/aizu-connect-prod/rulesets/f0d8b986-2f44-48c9-a82e-649c71b7101e`

必要な場合は[運用・障害対応手順](./operations-runbook.md)に沿って切り戻す。実行ログ・ソース／ビルドのファイル別ハッシュ・適用前後のメタデータ・公開画面の画像は作業端末の`/private/tmp/aizu-connect-release-2026-10-30/`に保存した。一時ディレクトリのため恒久保管は保証しない。
