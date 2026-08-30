// S5b — ジョイフル 商品情報一覧 PDF parser (新規チェーン)。
//
// 形式 (2026-08-25 版 cal.pdf、 11p / 357 データ行で検証):
//   `品名 kcal P F C 食塩 [● ● …]` が 1 行で完結する理想形式。
//   zensho 系と違い menu name list の別枠照合が不要 = 校正コスト最小
//   (docs/recon-chain-data-5a.md §3)。
// column order は先頭注記の「エネルギー、たんぱく質、脂質、炭水化物、
// 食塩相当量」どおり (kcal, P, F, C, salt) — Ｊｏｙチーズインハンバーグ
// セット 852kcal に対し Atwater 近似 4P+9F+4C=828 で整合確認済み。
//
// 重複名の扱い:
//   - 店内セクションとテイクアウトセクションで同名 item が数値違いで
//     再掲される (例: 彩り野菜と若鶏の黒酢あんかけ（単品） 747 vs 718)。
//     `テイクアウト（…）` 見出し以降の行は takeaway mode として、
//     店内版と衝突する名前に `（テイクアウト）` を付ける (sukiya の
//     「牛丼ライト（テイクアウト）」既存慣例に合わせる)。
//   - 同 mode 内の同名・同値の再掲 (例: 目玉焼き（単品） が 2 セクション
//     に載る) は dedupe。 同名・異値は data 破損なので fail-fast。
//
// serving 表現は dennys 先例 (servingUnit '皿') に合わせ、 add-food の
// hint が 「1 皿 / 852 kcal」 と読めるようにする。

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// 品名 + 数値 5 列 (kcal は整数が基本だが小数も許容) + アレルゲン●任意。
// 品名側は最短一致 — 末尾の数値 5 列 anchor が先に確定する。
const ITEM_ROW_REGEX =
  /^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*●)*\s*$/;

const TAKEAWAY_HEADING_REGEX = /^テイクアウト（.+）$/;

export interface JoyfullParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export interface JoyfullParseResult {
  output: RestaurantScrapeOutput;
  // Atwater 近似 (4P+9F+4C) から大きく外れた行 — drop はしない
  // (公式値には食物繊維・糖アルコール由来の乖離が正当に存在する)
  // が、 spot-check で優先照合する対象としてレポートに出す。
  suspects: string[];
  dedupedCount: number;
}

export function parseJoyfull(opts: JoyfullParseOptions): JoyfullParseResult {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const items: MenuItemRecord[] = [];
  const byName = new Map<string, MenuItemRecord>();
  const storeNames = new Set<string>();
  const suspects: string[] = [];
  let takeaway = false;
  let dedupedCount = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[\s　]+$/g, '').replace(/^[\s　]+/g, '');
    if (!line) continue;
    if (TAKEAWAY_HEADING_REGEX.test(line)) {
      // テイクアウトセクションは PDF 末尾に連続配置 (2026-08-25 版で
      // 確認: 店内見出しは全てこれより前)。 一度 ON になったら維持。
      takeaway = true;
      continue;
    }
    const m = line.match(ITEM_ROW_REGEX);
    if (!m) continue;
    let name = m[1].replace(/[\s　]+$/g, '');
    // ページヘッダ等の誤爆保険: 品名に日本語/英数字が 1 文字も無い行は捨てる
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-zＡ-Ｚａ-ｚ０-９]/u.test(name)) {
      continue;
    }
    const calories = Number(m[2]);
    const protein = Number(m[3]);
    const fat = Number(m[4]);
    const carb = Number(m[5]);
    const salt = Number(m[6]);

    if (takeaway && storeNames.has(name)) {
      name = `${name}（テイクアウト）`;
    }
    if (!takeaway) storeNames.add(name);

    const existing = byName.get(name);
    if (existing) {
      const sameValues =
        existing.caloriesPerServing === calories
        && existing.proteinG === protein
        && existing.fatG === fat
        && existing.carbG === carb
        && existing.saltG === salt;
      if (sameValues) {
        dedupedCount += 1;
        continue;
      }
      throw new Error(
        `[joyfull] duplicate name with different values: ${name} `
        + `(${existing.caloriesPerServing} vs ${calories} kcal) — parser 要調査`,
      );
    }

    const atwater = 4 * protein + 9 * fat + 4 * carb;
    if (Math.abs(calories - atwater) > Math.max(60, calories * 0.35)) {
      suspects.push(`${name} (${calories}kcal vs Atwater ${Math.round(atwater)})`);
    }

    // 全角英数の品名 (Ｊｏｙ…) は NFKC 版を alias に持たせて検索ヒットを
    // 守る (FTS5 unicode61 は幅折りをしない)。 括弧等の記号は tokenizer
    // が separator 扱いするので、 記号だけが全角→半角になる品名
    // (例: （チョコ）) に無駄な alias を付けない — 英数字・文字の
    // 内容が変わる場合のみ。
    const nfkc = name.normalize('NFKC');
    const letters = (s: string): string => s.replace(/[^\p{L}\p{N}]/gu, '');
    const needsAlias = letters(nfkc) !== letters(name);
    const record: MenuItemRecord = {
      name,
      ...(needsAlias ? { aliases: [nfkc] } : {}),
      servingSizeG: 100,
      servingUnit: '皿',
      caloriesPerServing: calories,
      proteinG: protein,
      fatG: fat,
      carbG: carb,
      saltG: salt,
      source: 'official_disclosure',
      sourceUrl: opts.sourceUrl,
      sourceCapturedAt: opts.sourceCapturedAt,
    };
    byName.set(name, record);
    items.push(record);
  }

  return {
    output: {
      chainSlug: 'joyfull',
      chainName: 'ジョイフル',
      restaurantType: 'dining',
      category: 'ファミレス',
      aliases: ['ジョイフル', 'joyfull', 'Joyfull'],
      attribution: '公式 PDF より (ジョイフル 商品情報一覧)',
      attributionUrl: opts.sourceUrl,
      sourceCapturedAt: opts.sourceCapturedAt,
      menuItems: items,
    },
    suspects,
    dedupedCount,
  };
}

async function main(): Promise<void> {
  const { output, suspects, dedupedCount } = parseJoyfull({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'joyfull.txt'),
    sourceUrl: 'https://www.joyfull.co.jp/cal_pdf/cal.pdf',
    sourceCapturedAt: '2026-08-30',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'joyfull.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[joyfull] wrote ${output.menuItems.length} items (deduped ${dedupedCount}) → ${path.relative(REPO_ROOT, outPath)}`,
  );
  if (suspects.length > 0) {
    console.log(`[joyfull] Atwater suspects (${suspects.length}) — spot-check 優先対象:`);
    for (const s of suspects) console.log(`  - ${s}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
