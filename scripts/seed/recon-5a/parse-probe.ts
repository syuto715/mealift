// S5a — PDF テキスト抽出 probe (ローカルファイル → text dump)。
// 使い方: tsx parse-probe.ts <pdf-path> <out-txt>
import * as fs from 'fs';
import { PDFParse } from 'pdf-parse';

async function main() {
  const [pdfPath, outPath] = process.argv.slice(2);
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  fs.writeFileSync(outPath, result.text);
  console.log(`pages=${result.total ?? '?'} chars=${result.text.length}`);
}

void main();
