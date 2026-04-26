import * as fs from 'fs';
import * as path from 'path';

// Plain HTTP file downloader for officially-distributed nutrition
// datasets (MEXT Excel, ministry PDFs, etc.). This is NOT a scraper —
// it is intended only for files whose source explicitly permits
// download / redistribution. See docs/data-sources.md for the
// allow-list; do not point this at sites that prohibit automated
// retrieval.

const DEFAULT_USER_AGENT =
  'Mealift food-import (build-time tool; +https://github.com/)';

export interface FetchOptions {
  url: string;
  // If set, write the response body to this path and return the path.
  // If unset, return the response body as a Buffer.
  outputPath?: string;
  userAgent?: string;
  // Minimum content-length below which we treat the response as
  // suspicious (e.g. an HTML error page returned with HTTP 200).
  // Defaults to 1024 bytes — override per-source when the expected
  // payload is meaningfully larger (a MEXT workbook is ~3 MB).
  minBytes?: number;
}

export async function fetchToFile(opts: FetchOptions & { outputPath: string }): Promise<string> {
  const buf = await fetchBuffer(opts);
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  fs.writeFileSync(opts.outputPath, buf);
  return opts.outputPath;
}

export async function fetchBuffer(opts: FetchOptions): Promise<Buffer> {
  const res = await fetch(opts.url, {
    headers: { 'User-Agent': opts.userAgent ?? DEFAULT_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`fetch ${opts.url}: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const minBytes = opts.minBytes ?? 1024;
  if (buf.byteLength < minBytes) {
    throw new Error(
      `fetch ${opts.url}: response only ${buf.byteLength} bytes (expected >= ${minBytes}). ` +
        'Common cause: source returned an HTML error page with HTTP 200.',
    );
  }
  return buf;
}

export async function fetchText(url: string, userAgent?: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent ?? DEFAULT_USER_AGENT },
  });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  return res.text();
}
