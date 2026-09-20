# Aizu Connect UI設計基準

更新日: 2026-08-03

## 参照した公式デザインシステム

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/): 内容を優先した明確な視覚階層、操作結果の分かりやすさ
- [Google Android Accessibility - Touch target size](https://support.google.com/accessibility/android/answer/7101858): タッチ領域は原則48×48dp、近接する操作には間隔を設ける
- [GitHub Primer - Icon](https://primer.github.io/design/components/icon/): アイコンは規定サイズで一貫して使い、意味を色だけに依存させず、装飾か情報かを明確にする
- [GOV.UK Design System - Type scale](https://design-system.service.gov.uk/styles/type-scale/): 端末ごとに読みやすい文字サイズと行間を使い、一定の垂直リズムを保つ
- [GOV.UK Design System - Layout](https://design-system.service.gov.uk/styles/layout/): 小さい画面を起点に設計し、長すぎる本文行を避ける
- [IBM Carbon - Accessibility](https://carbondesignsystem.com/guidelines/accessibility/overview/): WCAG AAを基準に、障害の有無を問わず使いやすい部品を採用する
- [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale): 背景、部品、境界、強調、文字を同じ色の濃淡ではなく用途別の段階として設計する
- [Apple Human Interface Guidelines - Color](https://developer.apple.com/design/human-interface-guidelines/color): ブランド、操作、状態の色を一貫させ、色だけで意味を伝えない
- [GOV.UK Design System - Colour](https://design-system.service.gov.uk/styles/colour/): 色を機能へ割り当て、文字と操作要素はWCAG AA以上のコントラストを保つ

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

### 色と質感

- ブランド青`#155eef`は、主要操作、リンク、選択状態、フォーカスなど「操作できる場所」を中心に使う。
- ページ背景は少し温かい`#f7f7f4`、浮いた面は`#fffefa`とし、青みのある白を画面全体へ重ねない。
- 主文字`#1c2735`、本文`#37485b`、補助文字`#627083`を用途別に使い、補助文字でも通常文字のWCAG AAを満たす。
- 境界線はニュートラルな`#dde2e5`を基本とし、カードごとに異なる薄青色を増やさない。
- 成功、注意、危険は落ち着いた緑、琥珀、赤へ限定し、ブランド青で状態を代用しない。
- 影は青く着色せず、面が重なる箇所だけに低い無彩色の影を使う。
- 意味のないグラデーション、方眼、発光、半透明カード、過剰なピル形状は使わない。写真、文章、余白、実データを画面の個性にする。
- 配色は明るい場所と暗い場所、PCとスマートフォン、高コントラスト設定で確認する。

## 今後の受け入れ条件

1. 新しい既定画像に生成写真や出所不明の写真を追加しない。
2. 新しいアイコンは既存ライブラリから選び、同じ意味に複数のアイコンを使わない。
3. 新しい操作要素はキーボードで到達でき、見えるフォーカス状態を持つ。
4. スマートフォンの主要操作領域は44px未満にしない。
5. PC、タブレット、スマートフォンの主要フローを変更のたびに確認する。
6. 新しい色は既存の意味トークンへ割り当て、似た薄青色を個別に追加しない。
