import * as fs from 'fs';
import * as path from 'path';
import type { MextFoodSeed } from './transform';

interface AliasDictionaryEntry {
  /** Exact 5-digit MEXT food number to match. Preferred. */
  foodNumber?: string;
  /** If `foodNumber` is not given, match any food whose `nameJa` contains this substring. */
  nameContains?: string;
  aliases: string[];
  aliasType?: 'kana' | 'short' | 'brand' | 'common';
}

export interface GeneratedAlias {
  foodId: string;
  aliasName: string;
  aliasType: 'kana' | 'short' | 'brand' | 'common';
}

const DICT_PATH = path.resolve(__dirname, 'alias-dictionary.json');

function stripBrackets(s: string): string {
  return s
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/[【\[][^\]】]*[\]】]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a set of {foodId, alias} pairs from two sources:
 *   1. Manual dictionary (`alias-dictionary.json`) — authoritative.
 *   2. Lightweight heuristics: strip qualifiers in parentheses, pull
 *      the first whitespace-separated token, etc.
 */
export function generateAliases(foods: MextFoodSeed[]): GeneratedAlias[] {
  let dict: AliasDictionaryEntry[] = [];
  try {
    const raw = fs.readFileSync(DICT_PATH, 'utf-8');
    dict = JSON.parse(raw) as AliasDictionaryEntry[];
  } catch (err) {
    console.warn(`  Could not read ${DICT_PATH}: ${(err as Error).message}`);
  }

  const out: GeneratedAlias[] = [];
  const seen = new Set<string>();
  const push = (
    foodId: string,
    aliasName: string,
    aliasType: GeneratedAlias['aliasType'] = 'common',
  ) => {
    const clean = aliasName.trim();
    if (!clean) return;
    const key = `${foodId}::${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ foodId, aliasName: clean, aliasType });
  };

  // --- 1. dictionary-driven aliases ---
  for (const entry of dict) {
    const aliasType = entry.aliasType ?? 'common';
    if (entry.foodNumber) {
      const id = `mext_${entry.foodNumber}`;
      if (!foods.some((f) => f.id === id)) continue;
      for (const a of entry.aliases) push(id, a, aliasType);
    } else if (entry.nameContains) {
      const needle = entry.nameContains;
      const matches = foods.filter((f) => f.nameJa.includes(needle));
      for (const m of matches) {
        for (const a of entry.aliases) push(m.id, a, aliasType);
      }
    }
  }

  // --- 2. heuristic: first token after stripping brackets ---
  for (const food of foods) {
    const cleaned = stripBrackets(food.nameJa);
    if (!cleaned || cleaned === food.nameJa) continue;
    // add the cleaned version as a "short" alias if it's distinctive
    if (cleaned.length >= 2 && cleaned.length < food.nameJa.length) {
      push(food.id, cleaned, 'short');
    }
    const firstToken = cleaned.split(/[\s　]+/)[0];
    if (firstToken && firstToken.length >= 2 && firstToken !== cleaned) {
      push(food.id, firstToken, 'short');
    }
  }

  return out;
}
