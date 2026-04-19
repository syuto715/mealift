import * as fs from 'fs';
import * as path from 'path';
import { downloadMextData } from './download';
import { parseMextExcel } from './parse';
import { transformMextRows } from './transform';
import { generateAliases } from './generate-aliases';

const SEED_DIR = path.resolve(
  __dirname,
  '../../src/infra/database/seed/data',
);
const OUT_FOODS = path.join(SEED_DIR, 'foods-mext.json');
const OUT_ALIASES = path.join(SEED_DIR, 'aliases-mext.json');

async function main(): Promise<void> {
  console.log('MEXT food composition import');
  console.log('============================');

  console.log('\n[1/4] Downloading MEXT workbook...');
  const excelPath = await downloadMextData();

  console.log('\n[2/4] Parsing Excel...');
  const rawRows = await parseMextExcel(excelPath);
  console.log(`  Parsed ${rawRows.length} food rows`);

  console.log('\n[3/4] Transforming to seed format...');
  const foods = transformMextRows(rawRows);
  console.log(`  Produced ${foods.length} unique foods`);
  console.log(
    `  isCommon=true: ${foods.filter((f) => f.isCommon).length} items`,
  );

  console.log('\n[4/4] Generating aliases...');
  const aliases = generateAliases(foods);
  console.log(`  Produced ${aliases.length} alias rows`);

  fs.mkdirSync(SEED_DIR, { recursive: true });
  fs.writeFileSync(OUT_FOODS, JSON.stringify(foods, null, 2), 'utf-8');
  fs.writeFileSync(OUT_ALIASES, JSON.stringify(aliases, null, 2), 'utf-8');

  const foodKb = (fs.statSync(OUT_FOODS).size / 1024).toFixed(1);
  const aliasKb = (fs.statSync(OUT_ALIASES).size / 1024).toFixed(1);
  console.log('\nDone.');
  console.log(`  ${OUT_FOODS}  (${foodKb} KB)`);
  console.log(`  ${OUT_ALIASES}  (${aliasKb} KB)`);
  console.log('');
  console.log(
    'Next: start the app (npm start). The seed step will pick up the new data on first launch.',
  );
}

main().catch((err) => {
  console.error('\nImport failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
