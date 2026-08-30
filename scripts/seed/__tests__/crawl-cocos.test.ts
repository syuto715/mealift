// S5b — cocos crawler pure-function tests (fixture は実ページ構造の縮約)。

import { extractCategoryUrls, extractItemUrls, parseItemPage } from '../crawl-cocos';

const ITEM_HTML = `
<html><head><title> ココスのハンバーグ | メニュー | ココス ファミリーレストラン [COCO'S] </title></head>
<body>
<h1>ハンバーグ</h1>
<h2 class="menu_ttl">ココスのハンバーグ</h2>
<p>¥790 (税込 ¥869)</p>
<table>
<tr><th>エネルギー</th><td>350kcal</td></tr>
<tr><th>たんぱく質</th><td>19.8g</td></tr>
<tr><th>脂質</th><td>22.5g</td></tr>
<tr><th>炭水化物</th><td>14.7g</td></tr>
<tr><th>食塩相当量</th><td>1.5g</td></tr>
</table>
<p>※栄養価はソースを含みません。</p>
<p>デミグラスソース</p>
<p>エネルギー33kcal&emsp;たんぱく質1.3g&emsp;脂質1.6g&emsp;炭水化物3.5g&emsp;食塩相当量0.6g</p>
<p>ジャポネギソース</p>
<p>エネルギー27kcal&emsp;たんぱく質0.6g&emsp;脂質1.0g&emsp;炭水化物2.6g&emsp;食塩相当量0.5g</p>
</body></html>
`;

describe('cocos crawler', () => {
  it('parses the main nutrition table, not the inline sauce blocks', () => {
    const parsed = parseItemPage(ITEM_HTML);
    expect(parsed).toEqual({
      name: 'ココスのハンバーグ',
      calories: 350,
      protein: 19.8,
      fat: 22.5,
      carb: 14.7,
      salt: 1.5,
    });
  });

  it('returns null when the page has no main nutrition table', () => {
    const html = '<h2 class="menu_ttl">ドリンクバー</h2><p>説明のみ</p>';
    expect(parseItemPage(html)).toBeNull();
  });

  it('extracts category and item URLs with dedupe + sort', () => {
    const index = `
      <a href="/menu/grand/hamburg/">A</a>
      <a href="/menu/grand/hamburg/">A2</a>
      <a href="/menu/kids/">K</a>
      <a href="/menu/">self</a>
      <a href="/vision/csr.html">not menu</a>
    `;
    expect(extractCategoryUrls(index)).toEqual([
      'https://www.cocos-jpn.co.jp/menu/grand/hamburg/',
      'https://www.cocos-jpn.co.jp/menu/kids/',
    ]);
    const cat = `
      <a href="/menu/grand/hamburg/hb_cocos2203.html">item</a>
      <a href="/menu/grand/hamburg/bhb2203.html">item</a>
      <a href="/menu/grand/hamburg/hb_cocos2203.html">dup</a>
      <a href="/vision/allergen.html">not menu</a>
    `;
    expect(extractItemUrls(cat)).toEqual([
      'https://www.cocos-jpn.co.jp/menu/grand/hamburg/bhb2203.html',
      'https://www.cocos-jpn.co.jp/menu/grand/hamburg/hb_cocos2203.html',
    ]);
  });
});
