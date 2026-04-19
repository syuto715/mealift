import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

const DOWNLOAD_DIR = path.resolve(__dirname, 'downloaded');
const EXCEL_FILENAME = 'mext-food-composition-2023.xlsx';
const TARGET_PATH = path.join(DOWNLOAD_DIR, EXCEL_FILENAME);

// Candidate direct download URLs for the MEXT Food Composition Table
// (八訂 増補2023年, 本表). These may break when MEXT reorganises their
// website — when that happens the script falls back to manual download.
const CANDIDATE_URLS: string[] = [
  // 2023 増補 main composition table (本表)
  'https://www.mext.go.jp/content/20230428-mxt_kagsei-mext_00001_012.xlsx',
  // Alternative archive mirror for the same file
  'https://www.mext.go.jp/content/20230428-mxt_kagsei-mext_00001_011.xlsx',
];

export async function downloadMextData(): Promise<string> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  if (fs.existsSync(TARGET_PATH) && fs.statSync(TARGET_PATH).size > 0) {
    console.log(`  Using cached file: ${TARGET_PATH}`);
    return TARGET_PATH;
  }

  for (const url of CANDIDATE_URLS) {
    try {
      console.log(`  Fetching ${url} ...`);
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; bodyforge-import-mext/1.0; +https://github.com/)',
          Accept:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
        },
      });
      if (!res.ok) {
        console.warn(`  HTTP ${res.status} — trying next URL`);
        continue;
      }
      const buf = await res.buffer();
      if (buf.length < 100_000) {
        // A valid MEXT workbook is ~3 MB. Anything tiny is likely an HTML error page.
        console.warn(`  Response only ${buf.length} bytes — trying next URL`);
        continue;
      }
      fs.writeFileSync(TARGET_PATH, buf);
      console.log(`  Saved ${buf.length} bytes → ${TARGET_PATH}`);
      return TARGET_PATH;
    } catch (err) {
      console.warn(`  Fetch error: ${(err as Error).message}`);
    }
  }

  throw new Error(
    [
      '',
      '---------------------------------------------------------',
      '  Automatic download of the MEXT workbook failed.',
      '',
      '  Please download it manually and re-run the script:',
      '',
      '  1. Open https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html',
      '  2. Download the main Excel file',
      '     (labelled 本表 / 成分表全体 / 食品成分表).',
      `  3. Save it as:`,
      `     ${TARGET_PATH}`,
      '  4. Re-run:  npm run import-mext',
      '---------------------------------------------------------',
      '',
    ].join('\n'),
  );
}

// Allow running this file standalone for quick manual testing.
if (require.main === module) {
  downloadMextData()
    .then((p) => console.log(`OK: ${p}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
