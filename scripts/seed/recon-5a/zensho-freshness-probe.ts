// S5a — 最新 PDF (2026-08 取得) を既存 zensho パーサーに通し、
// 2026-05 時点の menu_names キャリブレーションがどれだけ生き残るかを検証する
// read-only probe。seed には書き込まない。
// 使い方: tsx scripts/seed/recon-5a/zensho-freshness-probe.ts <sukiya.txt> <nakau.txt>
import * as fs from 'fs';
import { parseZenshoPdf, extractSizeRows, groupSizeRows, DEFAULT_SIZE_LABELS } from '../parsers/zensho';
import { SUKIYA_MENU_NAMES } from '../parsers/menu_names/sukiya';
import { NAKAU_MENU_NAMES, NAKAU_SIZE_LABELS } from '../parsers/nakau';

// S5b Codex R1 Nit — chain 別 label 対応後の parser に合わせ、 なか卯は
// NAKAU_SIZE_LABELS で probe する。
function probe(
  label: string,
  txtPath: string,
  menuNames: string[],
  labels: readonly string[] = DEFAULT_SIZE_LABELS,
) {
  const text = fs.readFileSync(txtPath, 'utf-8');
  const rows = extractSizeRows(text, labels);
  const groups = groupSizeRows(rows, labels);
  const { items, totalGroups, unmappedGroups } = parseZenshoPdf(text, menuNames, {
    sourceUrl: 'probe',
    sourceCapturedAt: '2026-08-18',
  }, labels);
  console.log(
    `${label}: sizeRows=${rows.length} groups=${groups.length} ` +
      `menuNames=${menuNames.length} items=${items.length} ` +
      `totalGroups=${totalGroups} unmappedGroups=${unmappedGroups}`,
  );
  console.log(`  sample: ${items.slice(0, 3).map((i) => `${i.name} ${i.caloriesPerServing}kcal`).join(' / ')}`);
}

const [sukiyaTxt, nakauTxt] = process.argv.slice(2);
if (sukiyaTxt) probe('sukiya', sukiyaTxt, SUKIYA_MENU_NAMES);
if (nakauTxt) probe('nakau', nakauTxt, NAKAU_MENU_NAMES, NAKAU_SIZE_LABELS);
