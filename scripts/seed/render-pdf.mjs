// S5b — PDF ページ → PNG レンダラー (視覚照合用)。
//
// zensho 系 PDF の menu name ↔ data group 対応は stream order だけでは
// 検証できない (2026-05 較正には値近似による名前スワップが 6 ペア
// 混入していた)。 このツールでページを画像化し、 視覚テーブルと
// パーサー出力を 1:1 照合するのが再較正・spot-check の基準手順。
// 依存は pdfjs-dist + @napi-rs/canvas — どちらも pdf-parse v2 の
// 既存 dependency (新規依存なし)。
//
// Usage: node scripts/seed/render-pdf.mjs <pdf> <pages: 1,2,5> <out-prefix> [scale=2.0]
import fs from 'fs';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [pdfPath, pageSpec, outPrefix, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg ?? 2.0);
const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({ data }).promise;
const pages = pageSpec.split(',').map(Number);
for (const num of pages) {
  const page = await doc.getPage(num);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const out = `${outPrefix}-p${num}.png`;
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(`${out} ${Math.round(viewport.width)}x${Math.round(viewport.height)}`);
}
process.exit(0);
