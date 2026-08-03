# Aizu Connect UI設計基準

更新日: 2026-08-01

## 参照した公式デザインシステム

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/): 内容を優先した明確な視覚階層、操作結果の分かりやすさ
- [Google Android Accessibility - Touch target size](https://support.google.com/accessibility/android/answer/7101858): タッチ領域は原則48×48dp、近接する操作には間隔を設ける
- [GitHub Primer - Icon](https://primer.github.io/design/components/icon/): アイコンは規定サイズで一貫して使い、意味を色だけに依存させず、装飾か情報かを明確にする
- [GOV.UK Design System - Type scale](https://design-system.service.gov.uk/styles/type-scale/): 端末ごとに読みやすい文字サイズと行間を使い、一定の垂直リズムを保つ
- [GOV.UK Design System - Layout](https://design-system.service.gov.uk/styles/layout/): 小さい画面を起点に設計し、長すぎる本文行を避ける
- [IBM Carbon - Accessibility](https://carbondesignsystem.com/guidelines/accessibility/overview/): WCAG AAを基準に、障害の有無を問わず使いやすい部品を採用する

## Aizu Connectへの適用

### 写真・画像

- 出所や制作過程を保証できない既定写真は使用しない。
- 既定のイベント画像は、写真ではない単色ベースのカテゴリ図形を使う。
- 主催者がアップロードした実在イベントの画像は、主催者が権利と内容を確認したものとして扱う。
- 今後写真を追加する場合は、撮影者・提供元・利用許諾を記録できるものだけを採用する。

### ロゴ・アイコン

- ロゴはAizu Connect独自の「場所」と「接続」を表すマークに統一する。
- 他社のロゴや固有アイコンは模倣しない。PrimerやMaterialのサイズ、一貫性、ラベル付けの考え方を参照する。
- 操作用アイコンはLucideの同一ストローク系統で統一し、主要操作には文字ラベルを併記する。
- アイコンだけの操作には`title`または`aria-label`を付ける。

### 視認性・使用感

- 主要ボタンとフォームは高さ48px、補助操作も原則44px以上とする。
- フォーム文字は16px以上とし、スマートフォンでの意図しない拡大を防ぐ。
- 本文は最大65文字程度の行幅を目安にし、行間を広めに取る。
- 選択中のナビゲーションは色だけでなく背景面でも区別する。
- キーボード操作時のフォーカスリングは高コントラストで表示する。
- `prefers-reduced-motion`を尊重し、動きを減らす設定ではアニメーションを停止する。

## 今後の受け入れ条件

1. 新しい既定画像に生成写真や出所不明の写真を追加しない。
2. 新しいアイコンは既存ライブラリから選び、同じ意味に複数のアイコンを使わない。
3. 新しい操作要素はキーボードで到達でき、見えるフォーカス状態を持つ。
4. スマートフォンの主要操作領域は44px未満にしない。
5. PC、タブレット、スマートフォンの主要フローを変更のたびに確認する。
