import * as XLSX from 'xlsx';

export interface MextRawRow {
  /** 5-digit food number, e.g. '01088'. */
  foodNumber: string;
  /** Food group name, e.g. '穀類'. */
  foodGroup: string;
  /** Official Japanese name, e.g. 'こめ [水稲めし] 精白米 うるち米'. */
  nameJa: string;
  caloriesKcal: number;
  waterG: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  zincMg: number | null;
  vitaminAUg: number | null;
  vitaminB1Mg: number | null;
  vitaminB2Mg: number | null;
  vitaminB6Mg: number | null;
  vitaminB12Ug: number | null;
  folateUg: number | null;
  vitaminCMg: number | null;
  vitaminDUg: number | null;
  vitaminEMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  saltG: number | null;
}

/** 八訂 food-group code → Japanese name (first 2 digits of 食品番号). */
const FOOD_GROUPS: Record<string, string> = {
  '01': '穀類',
  '02': 'いも及びでん粉類',
  '03': '砂糖及び甘味類',
  '04': '豆類',
  '05': '種実類',
  '06': '野菜類',
  '07': '果実類',
  '08': 'きのこ類',
  '09': '藻類',
  '10': '魚介類',
  '11': '肉類',
  '12': '卵類',
  '13': '乳類',
  '14': '油脂類',
  '15': '菓子類',
  '16': 'し好飲料類',
  '17': '調味料及び香辛料類',
  '18': '調理済み流通食品類',
};

/**
 * Normalize a MEXT cell value to number | null.
 *
 * Sentinel values in 八訂:
 *   '-' / '−' / 'ー' / '未測定' / '0未満' → not measured         → null
 *   'Tr' / '(Tr)' / '痕跡' / '微量'       → trace                  → 0
 *   '(x)' or '(x.x)'                       → estimated value        → x
 *   'x*' or '*' (rule marker)              → strip '*'; bare '*' → null
 */
function normalizeNutrientValue(cell: unknown): number | null {
  if (cell == null) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  const s = String(cell).trim();
  if (!s) return null;
  if (s === '-' || s === '−' || s === 'ー' || s === '未測定' || s === '0未満')
    return null;
  if (s === '*') return null;
  if (s === 'Tr' || s === '(Tr)' || s === '痕跡' || s === '微量') return 0;
  // Strip parentheses on estimated values and any trailing '*' marker.
  const stripped = s
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .replace(/\*+$/, '')
    .trim();
  if (stripped === 'Tr') return 0;
  const m = stripped.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Try each candidate column index in order; return first non-null value. */
function pickFirst(row: unknown[], indices: number[]): number | null {
  for (const i of indices) {
    if (i < 0) continue;
    const v = normalizeNutrientValue(row[i]);
    if (v != null) return v;
  }
  return null;
}

/** Normalize whitespace (ASCII + full-width U+3000) for header comparison. */
function stripSpaces(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

/**
 * Locate the English-identifier row (八訂 spec row 11: REFUSE, ENERC, ENERC_KCAL, ...).
 * This row is stable across editions even when surrounding header merges change.
 */
function findIdentifierRow(rows: unknown[][]): number {
  const limit = Math.min(40, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    for (const cell of row) {
      if (cell != null && String(cell).trim() === 'ENERC_KCAL') return r;
    }
  }
  return -1;
}

/** Map "ENERC_KCAL" → column index, based on the English-identifier row. */
function buildIdentifierMap(idRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let c = 0; c < idRow.length; c++) {
    const v = idRow[c];
    if (v == null) continue;
    const key = String(v).trim();
    if (!key) continue;
    if (!(key in map)) map[key] = c;
  }
  return map;
}

/** Locate the 食品番号 column. Default B (col 1); fallback scans for 5-digit cells. */
function findFoodNumberCol(rows: unknown[][], idRowIdx: number): number {
  const isFoodNum = (v: unknown): boolean =>
    v != null && /^\d{5}$/.test(String(v).trim());
  const sampleStart = idRowIdx + 1;
  const sampleEnd = Math.min(sampleStart + 30, rows.length);

  // Fast path: 八訂 places 食品番号 in column 1 (B).
  let hits = 0;
  for (let r = sampleStart; r < sampleEnd; r++) {
    if (isFoodNum(rows[r]?.[1])) hits++;
  }
  if (hits >= 3) return 1;

  // Fallback: first column with ≥3 five-digit cells in the sample window.
  const maxCol = rows[sampleStart]?.length ?? 20;
  for (let c = 0; c < maxCol; c++) {
    let n = 0;
    for (let r = sampleStart; r < sampleEnd; r++) {
      if (isFoodNum(rows[r]?.[c])) n++;
    }
    if (n >= 3) return c;
  }
  return -1;
}

/** Locate the 食品名 column. Prefer a header cell containing "食品名"; default to col 3. */
function findFoodNameCol(rows: unknown[][], idRowIdx: number): number {
  for (let r = 0; r < idRowIdx; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v != null && stripSpaces(String(v)) === '食品名') return c;
    }
  }
  return 3;
}

export async function parseMextExcel(filePath: string): Promise<MextRawRow[]> {
  const workbook = XLSX.readFile(filePath, { cellDates: false });

  // 八訂 workbooks expose '表全体' (whole table) plus per-group sheets.
  // Prefer '表全体' — that's where every row lives with consistent column layout.
  const sheetName =
    workbook.SheetNames.find((n) => n.includes('表全体')) ??
    workbook.SheetNames.find((n) => n.includes('本表')) ??
    workbook.SheetNames.find((n) => n.includes('成分表')) ??
    workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  console.log(`  Sheet: ${sheetName} (${rows.length} rows incl. headers)`);

  const idRowIdx = findIdentifierRow(rows);
  if (idRowIdx < 0)
    throw new Error(
      "Could not find the English-identifier row — 'ENERC_KCAL' not present in first 40 rows",
    );
  console.log(`  Identifier row: ${idRowIdx}`);

  const idMap = buildIdentifierMap(rows[idRowIdx] ?? []);
  const col = (key: string): number => (key in idMap ? idMap[key] : -1);

  const foodNumberCol = findFoodNumberCol(rows, idRowIdx);
  if (foodNumberCol < 0)
    throw new Error('Could not locate the 食品番号 column (no 5-digit values)');
  const foodNameCol = findFoodNameCol(rows, idRowIdx);

  const cols = {
    foodNumber: foodNumberCol,
    foodName: foodNameCol,
    kcal: col('ENERC_KCAL'),
    water: col('WATER'),
    // Protein: amino-acid-derived value preferred, crude protein as fallback.
    protein: [col('PROTCAA'), col('PROT-')],
    // Fat: triacylglycerol-derived value preferred, crude fat as fallback.
    fat: [col('FATNLEA'), col('FAT-')],
    // Carb: available carb (mass) preferred → available carb (mono-eq) → differential.
    carb: [col('CHOAVLM'), col('CHOAVL'), col('CHOCDF-')],
    fiber: col('FIB-'),
    sodium: col('NA'),
    potassium: col('K'),
    calcium: col('CA'),
    magnesium: col('MG'),
    iron: col('FE'),
    zinc: col('ZN'),
    cholesterol: col('CHOLE'),
    // VITA_RAE = retinol-activity equivalents (preferred); plain RETOL as last resort.
    vitaminA: col('VITA_RAE') >= 0 ? col('VITA_RAE') : col('RETOL'),
    vitaminD: col('VITD'),
    // α-tocopherol represents "vitamin E" in the MEXT table.
    vitaminE: col('TOCPHA'),
    vitaminB1: col('THIA'),
    vitaminB2: col('RIBF'),
    // VITB6A = B6 intake (pyridoxine-equivalent); fall back to plain VITB6.
    vitaminB6: col('VITB6A') >= 0 ? col('VITB6A') : col('VITB6'),
    vitaminB12: col('VITB12'),
    folate: col('FOL'),
    vitaminC: col('VITC'),
    salt: col('NACL_EQ'),
  };

  if (cols.kcal < 0) throw new Error('ENERC_KCAL column index missing');
  console.log('  Column indices:', cols);

  const out: MextRawRow[] = [];
  for (let i = idRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const fnRaw = r[cols.foodNumber];
    if (fnRaw == null) continue;
    const fn = String(fnRaw).trim();
    if (!/^\d{5}$/.test(fn)) continue;

    const name = r[cols.foodName] != null ? String(r[cols.foodName]).trim() : '';
    if (!name) continue;

    const foodGroup = FOOD_GROUPS[fn.slice(0, 2)] ?? '';

    out.push({
      foodNumber: fn,
      foodGroup,
      nameJa: name,
      caloriesKcal: normalizeNutrientValue(r[cols.kcal]) ?? 0,
      waterG:
        cols.water >= 0
          ? normalizeNutrientValue(r[cols.water]) ?? 0
          : 0,
      proteinG: pickFirst(r, cols.protein) ?? 0,
      fatG: pickFirst(r, cols.fat) ?? 0,
      carbG: pickFirst(r, cols.carb) ?? 0,
      fiberG:
        cols.fiber >= 0 ? normalizeNutrientValue(r[cols.fiber]) : null,
      sodiumMg:
        cols.sodium >= 0 ? normalizeNutrientValue(r[cols.sodium]) : null,
      potassiumMg:
        cols.potassium >= 0 ? normalizeNutrientValue(r[cols.potassium]) : null,
      calciumMg:
        cols.calcium >= 0 ? normalizeNutrientValue(r[cols.calcium]) : null,
      magnesiumMg:
        cols.magnesium >= 0 ? normalizeNutrientValue(r[cols.magnesium]) : null,
      ironMg: cols.iron >= 0 ? normalizeNutrientValue(r[cols.iron]) : null,
      zincMg: cols.zinc >= 0 ? normalizeNutrientValue(r[cols.zinc]) : null,
      vitaminAUg:
        cols.vitaminA >= 0 ? normalizeNutrientValue(r[cols.vitaminA]) : null,
      vitaminDUg:
        cols.vitaminD >= 0 ? normalizeNutrientValue(r[cols.vitaminD]) : null,
      vitaminEMg:
        cols.vitaminE >= 0 ? normalizeNutrientValue(r[cols.vitaminE]) : null,
      vitaminB1Mg:
        cols.vitaminB1 >= 0 ? normalizeNutrientValue(r[cols.vitaminB1]) : null,
      vitaminB2Mg:
        cols.vitaminB2 >= 0 ? normalizeNutrientValue(r[cols.vitaminB2]) : null,
      vitaminB6Mg:
        cols.vitaminB6 >= 0 ? normalizeNutrientValue(r[cols.vitaminB6]) : null,
      vitaminB12Ug:
        cols.vitaminB12 >= 0 ? normalizeNutrientValue(r[cols.vitaminB12]) : null,
      folateUg:
        cols.folate >= 0 ? normalizeNutrientValue(r[cols.folate]) : null,
      vitaminCMg:
        cols.vitaminC >= 0 ? normalizeNutrientValue(r[cols.vitaminC]) : null,
      cholesterolMg:
        cols.cholesterol >= 0
          ? normalizeNutrientValue(r[cols.cholesterol])
          : null,
      saturatedFatG: null, // published in a separate 脂肪酸成分表; not in 本表
      sugarG: null, // likewise in a separate table
      saltG: cols.salt >= 0 ? normalizeNutrientValue(r[cols.salt]) : null,
    });
  }
  return out;
}
