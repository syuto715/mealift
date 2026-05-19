export const TULLYS_DRINK_PER_PAGE_MENU_NAMES: string[][] = [
  // Page 1 — Seasonal Beverages
  // Manually curated from the visual PDF row order; the raw footer stream is incomplete/out of order on this page.
  [
    'クッキー＆クリームシェイク',
    'もっと︕クッキー＆クリームシェイク',
    'チョコミントシェイク',
    'もっと︕チョコミントシェイク',
    '＆TEA グレープフルーツセパレートティー',
    '練乳ミルクアイスコーヒー',
    '練乳ミルクアイスコーヒー',
    'マスカルポーネティラミスシェイク',
    '抹茶ティラミスシェイク',
    '＆TEA ご褒美いちごティーリスタ®',
    '水出しアイスコーヒー',
    'カリッとキャンディーキャラメルシェイク',
  ],

  // Page 2 — Espresso Beverages
  // Visual PDF order; the footer JA/EN stream is reversed and interleaved with HOT/ICED and milk-type annotations.
  [
    'カフェラテ',
    'カフェラテ',
    'カフェモカ',
    'カフェモカ',
    'カフェモカ',
    'カフェモカ',
    'ハニーミルクラテ',
    'ハニーミルクラテ',
    'ハニーミルクラテ',
    'ハニーミルクラテ',
    'ソイラテ',
    'ソイラテ',
    'カプチーノ',
    'カプチーノ',
    'カフェアメリカーノ',
    'カフェアメリカーノ',
    'キャラメルラテ with ソルティーキャラメルソース',
    'キャラメルラテ with ソルティーキャラメルソース',
    'キャラメルラテ with ソルティーキャラメルソース',
    'キャラメルラテ with ソルティーキャラメルソース',
  ],

  // Page 3 — Espresso / Coffee / Swirkle
  // Visual PDF order; the footer stream is reversed and interleaves multiple sections.
  [
    'エスプレッソ',
    'エスプレッソマキアート',
    'エスプレッソマキアート',
    'エスプレッソコンパナ',
    '本日のコーヒー',
    'アイスコーヒー',
    'カフェオレ',
    'カフェオレ',
    'カフェオレ',
    'カフェオレ',
    'デカフェ コーヒー',
    'デカフェ コーヒー',
    'イマージョンコーヒー',
    '抹茶リスタ',
    'ほうじ茶リスタ',
    'エスプレッソシェイク',
    'マンゴータンゴスワークル',
    'ティーリスタ アールグレイロイヤル',
    'チョコリスタ®',
  ],

  // Page 4 — Tea Beverages
  // Visual PDF order; the footer stream is reversed and interleaved with milk-type annotations.
  [
    '＆TEA オリジナル マラウイ＆ダージリン',
    '水出しアイスティー',
    'ロイヤルミルクティー',
    'ロイヤルミルクティー',
    'ロイヤルミルクティー',
    'ロイヤルミルクティー',
    '＆TEA チャイミルクティー',
    '＆TEA チャイミルクティー',
    '＆TEA チャイミルクティー',
    '＆TEA チャイミルクティー',
    'ほうじ茶ラテ',
    'ほうじ茶ラテ',
    'ほうじ茶ラテ',
    'ほうじ茶ラテ',
    '宇治抹茶ラテ',
    '宇治抹茶ラテ',
    '宇治抹茶ラテ',
    '宇治抹茶ラテ',
  ],

  // Page 5 — Other
  // Only the 3-size "その他" rows match the raw 18-token nutrition-tail pattern; "キッズ" one-size rows are excluded.
  [
    'ブラッドオレンジジュース',
    'りんごストレート100%',
    'ココアラテ',
    'ココアラテ',
    'ココアラテ',
    'ココアラテ',
    'ミルク',
    'ミルク',
    'ミルク',
    'ミルク',
    'ヨーグルト＆アサイー',
  ],

  // Page 6 — Customize
  // The raw text only exposes the six 3-size rows here; one-size customizations such as shots/powders do not match the row pattern.
  [
    'ホイップクリーム',
    'ホイップクリーム',
    'with スチームミルク',
    'with スチームミルク',
    'フレーバーシロップの追加',
    'フレーバーシロップの追加',
  ],

  // Page 7 — T's Icelush / Delivery / Mobile Order
  // The raw 3-size row block starts at T'sアイスラッシュ; the one-size T'sアイス rows above it are excluded.
  [
    'アイスラッシュ ストロベリー',
    'アイスラッシュ 宇治抹茶',
    'アイスラッシュ ほうじ茶',
    'エスプレッソシェイク with ホイップクリーム',
    '【MO】ダブルエスプレッソラテ',
    '【MO】ダブルエスプレッソラテ',
    '【MO】ダブルエスプレッソハニーミルクラテ',
    '【MO】ダブルエスプレッソハニーミルクラテ',
  ],
];
