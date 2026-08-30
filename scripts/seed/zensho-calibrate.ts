// S5b — Zensho 系 menu_names 再キャリブレーション支援ツール。
//
// 背景: zensho PDF は data 行 (size+数値) と menu name list の stream
// 順が一致せず、 menu names は hand-author 供給 (zensho.ts §Step 3)。
// メニュー改定で group が中間挿入されると name→group 対応が黙って
// ズレる (S5b 冒頭の検証で 2026-08 sukiya PDF に実在を確認 —
// 牛丼ライト section 以降が全滅していた)。
//
// このツールは「前回 JSON の (name → size→数値) を fingerprint に、
// 新 PDF の各 group へ旧名を自動対応付け」する:
//   - group の数値 tuple が旧 item と (許容誤差内で) 一致 → 旧名を提案
//   - 一致なし → 新メニュー。 同ページの name 候補 (旧名で消費されな
//     かったもの) を提示するので、 人間が数値の妥当性を見て割り当てる
// 出力はそのまま menu_names/*.ts に貼れる配列 + 判定根拠コメント。
//
// Usage:
//   npx tsx scripts/seed/zensho-calibrate.ts sukiya <new.txt>
//   npx tsx scripts/seed/zensho-calibrate.ts nakau <new.txt>

import * as fs from 'fs';
import * as path from 'path';
import { extractSizeRows, groupSizeRows, DEFAULT_SIZE_LABELS, ZenshoSizeRow } from './parsers/zensho';
import { NAKAU_SIZE_LABELS } from './parsers/nakau';
import type { RestaurantScrapeOutput } from './types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

interface GroupInfo {
  index: number;
  page: number;
  rows: ZenshoSizeRow[];
}

// data 行・ヘッダ・縦書き崩れ (1-2 文字) を除いた「品名らしい」行を
// ページごとに収集する。
function pageNameCandidates(text: string, labels: readonly string[]): Map<number, string[]> {
  const sizeRegexProbe = (line: string): boolean =>
    extractSizeRows(line, labels).length > 0;
  const candidates = new Map<number, string[]>();
  let page = 1;
  const NOISE = /^(栄養成分|●|※|・|〈|（|カロリー|サイズ|炭水化物|食塩相当量|更新日|\(kcal\)|すき家メニュー|なか卯メニュー|たんぱく質|脂質|熱量|カテゴリー|メニュー)/;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const pageMarker = line.match(/^-- (\d+) of \d+ --$/);
    if (pageMarker) {
      page = Number(pageMarker[1]) + 1;
      continue;
    }
    if (!line || line.length <= 2 || NOISE.test(line) || sizeRegexProbe(line)) continue;
    const arr = candidates.get(page) ?? [];
    arr.push(line);
    candidates.set(page, arr);
  }
  return candidates;
}

function groupsWithPages(text: string, labels: readonly string[]): GroupInfo[] {
  // ページ単位で group 化してから通し番号を振る (group がページを跨が
  // ない前提 — zensho PDF は card 単位レイアウトなので成立)。
  const out: GroupInfo[] = [];
  let page = 1;
  let buf: string[] = [];
  let index = 0;
  const flush = (): void => {
    const rows = extractSizeRows(buf.join('\n'), labels);
    for (const g of groupSizeRows(rows, labels)) {
      out.push({ index: index++, page, rows: g });
    }
    buf = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const marker = raw.trim().match(/^-- (\d+) of \d+ --$/);
    if (marker) {
      flush();
      page = Number(marker[1]) + 1;
      continue;
    }
    buf.push(raw);
  }
  flush();
  return out;
}

interface OldFingerprint {
  name: string;
  bySize: Map<string, { calories: number; protein: number; fat: number; carb: number; salt: number }>;
}

function oldFingerprints(prev: RestaurantScrapeOutput): OldFingerprint[] {
  const map = new Map<string, OldFingerprint>();
  for (const item of prev.menuItems) {
    if (item.discontinued) continue;
    // "name size" → base name + size (末尾 token が size)
    const sp = item.name.lastIndexOf(' ');
    if (sp < 0) continue;
    const base = item.name.slice(0, sp);
    const size = item.name.slice(sp + 1);
    const fp = map.get(base) ?? { name: base, bySize: new Map() };
    fp.bySize.set(size, {
      calories: item.caloriesPerServing,
      protein: item.proteinG,
      fat: item.fatG,
      carb: item.carbG,
      salt: item.saltG ?? 0,
    });
    map.set(base, fp);
  }
  return [...map.values()];
}

function matchScore(group: GroupInfo, fp: OldFingerprint): { shared: number; hits: number; exact: number } {
  let shared = 0;
  let hits = 0;
  let exact = 0;
  for (const row of group.rows) {
    const old = fp.bySize.get(row.size);
    if (!old) continue;
    shared += 1;
    const close =
      Math.abs(old.calories - row.calories) <= 15
      && Math.abs(old.protein - row.protein) <= 3
      && Math.abs(old.fat - row.fat) <= 3
      && Math.abs(old.carb - row.carb) <= 6
      && Math.abs(old.salt - row.salt) <= 1.5;
    if (close) hits += 1;
    if (
      old.calories === row.calories && old.protein === row.protein
      && old.fat === row.fat && old.carb === row.carb && old.salt === row.salt
    ) exact += 1;
  }
  return { shared, hits, exact };
}

async function main(): Promise<void> {
  const [chain, txtPath] = process.argv.slice(2);
  if (!chain || !txtPath) {
    console.error('Usage: zensho-calibrate.ts <sukiya|nakau> <new-pdf-text.txt>');
    process.exit(1);
  }
  const labels = chain === 'nakau' ? NAKAU_SIZE_LABELS : DEFAULT_SIZE_LABELS;
  const text = fs.readFileSync(txtPath, 'utf-8');
  const prev = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'seed', 'data', `${chain}.json`), 'utf-8'),
  ) as RestaurantScrapeOutput;

  const groups = groupsWithPages(text, labels);
  const names = pageNameCandidates(text, labels);
  // 値近似の誤爆対策 (S5b で実例 2 件): 旧名が新 PDF 本文に文字列と
  // して存在しない = そのメニューは廃番なので、 値がたまたま近い別
  // group に割り当ててはならない。 candidate を「新 PDF に名前が残って
  // いる旧名」に制限する。
  const fps = oldFingerprints(prev).filter((fp) => text.includes(fp.name));
  const usedOld = new Set<string>();

  console.log(`[calibrate:${chain}] groups=${groups.length} oldNames=${fps.length}`);
  const assignments: Array<{ group: GroupInfo; name: string | null; note: string }> = [];
  for (const g of groups) {
    let best: { fp: OldFingerprint; s: ReturnType<typeof matchScore> } | null = null;
    for (const fp of fps) {
      if (usedOld.has(fp.name)) continue;
      const s = matchScore(g, fp);
      if (s.shared === 0 || s.hits < Math.max(1, Math.ceil(s.shared * 0.75))) continue;
      // 共有 1 サイズだけの近似は根拠として弱い (S5b で 牛カレー →
      // 山かけとろろ牛皿定食 の誤割当例)。 旧 item 側も 1 サイズ構成の
      // 場合 (皿もの) に限り許容する。
      if (s.shared < 2 && fp.bySize.size > 1) continue;
      if (
        !best
        || s.exact > best.s.exact
        || (s.exact === best.s.exact && s.hits > best.s.hits)
      ) best = { fp, s };
    }
    if (best) {
      usedOld.add(best.fp.name);
      const kind = best.s.exact === g.rows.length ? 'exact' : `close(${best.s.hits}/${best.s.shared})`;
      assignments.push({ group: g, name: best.fp.name, note: kind });
    } else {
      assignments.push({ group: g, name: null, note: 'NEW/CHANGED' });
    }
  }

  console.log('\n=== 提案 menu names (group 順) ===');
  for (const a of assignments) {
    const sizes = a.group.rows.map((r) => `${r.size}:${r.calories}`).join(' ');
    console.log(
      `#${String(a.group.index).padStart(3)} p${a.group.page} ${a.name ?? '★未割当'} — ${a.note} [${sizes}]`,
    );
  }
  console.log('\n=== ページ別 name 候補 (未消費のみ) ===');
  for (const [page, list] of [...names.entries()].sort((x, y) => x[0] - y[0])) {
    const remaining = list.filter((n) => !usedOld.has(n));
    if (remaining.length > 0) console.log(`p${page}: ${remaining.join(' / ')}`);
  }
  console.log('\n=== 旧名で未使用 (消滅候補 = 廃番) ===');
  for (const fp of fps) {
    if (!usedOld.has(fp.name)) console.log(`- ${fp.name}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
