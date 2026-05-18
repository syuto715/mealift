// v1.5 Stage 2 Phase 2.2b — PDF fetcher + text extractor.
//
// pdf-parse v2 wraps a PDF URL (or buffer) → text. The text is
// dumped to `scripts/seed/_raw/${slug}.txt` for downstream
// structured extraction (per-chain semantic parser or
// AI-assisted summary).
//
// Why two-step (text extract here, structure later): real-world
// chain PDFs interleave menu names + size rows + category labels
// in PDF stream order that does NOT match visual reading order.
// Mechanical regex extraction requires per-PDF layout calibration.
// The Phase 2.2b sub-phase split is:
//   - this script (Step 0/1): URL → text, dependency-free I/O
//   - next sub-phase (per-chain Sprint Turn): text → structured
//     JSON via either hand-authored parser or AI-assist
//
// Usage:
//   pnpm tsx scripts/seed/pdf-fetcher.ts <slug> [<url>]
// When <url> is omitted, looks up the slug in the research manifest.

import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESEARCH_PATH = path.join(REPO_ROOT, 'data', 'research', 'restaurant_urls_v1.json');
const RAW_DIR = path.join(REPO_ROOT, 'scripts', 'seed', '_raw');

interface ResearchEntity {
  chain_slug: string;
  chain_name: string;
  official_urls: string[];
  data_format: string;
}

interface ResearchManifest {
  entities: ResearchEntity[];
}

function pickPdfUrl(entity: ResearchEntity): string | null {
  // First PDF-shaped URL wins. Most entities list 2-4 URLs (HTML
  // hub + PDF + alt PDFs). The hub URL is usually first; PDFs
  // come after.
  const pdf = entity.official_urls.find((u) => u.endsWith('.pdf'));
  return pdf ?? null;
}

export async function extractPdfText(url: string): Promise<{ text: string; pages: number }> {
  const parser = new PDFParse({ url });
  const result = await parser.getText();
  return {
    text: result.text,
    pages: result.pages?.length ?? 0,
  };
}

export function writeRawText(slug: string, text: string): string {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const outPath = path.join(RAW_DIR, `${slug}.txt`);
  fs.writeFileSync(outPath, text, 'utf-8');
  return outPath;
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  const explicitUrl = process.argv[3];
  if (!slug) {
    console.error('Usage: pdf-fetcher.ts <slug> [<url>]');
    process.exit(1);
  }
  let url = explicitUrl;
  if (!url) {
    const manifest = JSON.parse(fs.readFileSync(RESEARCH_PATH, 'utf-8')) as ResearchManifest;
    const entity = manifest.entities.find((e) => e.chain_slug === slug);
    if (!entity) {
      console.error(`[${slug}] not in research manifest`);
      process.exit(1);
    }
    const pdf = pickPdfUrl(entity);
    if (!pdf) {
      console.error(`[${slug}] no PDF URL discovered in research manifest`);
      process.exit(1);
    }
    url = pdf;
  }

  console.log(`[${slug}] fetching PDF: ${url}`);
  const { text, pages } = await extractPdfText(url);
  const outPath = writeRawText(slug, text);
  console.log(
    `[${slug}] OK — ${pages} pages, ${text.length} chars → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
