// v1.5 Stage 2 Phase 2.1 — cleanup-idempotency-keys EF extension
// contract pin.
//
// The EF itself is a Deno serve() handler that cannot be required
// from jest (uses URL imports). This test asserts on the EF source
// file's structure to pin the Stage 2 extension contract:
//   1. ai_lookup_logs is referenced (extension landed)
//   2. The 24h cutoff applies the same .lt('created_at', cutoffIso)
//      filter that chat_messages + routine_generations use
//   3. The return body advertises the new cleared_ai_lookup_logs key
//
// Drafting 96 (cleanup contract): NULL the idempotency_key on rows
// older than the cutoff, NOT delete the row. Partial unique index
// drops NULL entries automatically (NewI2 resolution from Stage 1).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const EF_SOURCE = readFileSync(
  resolve(__dirname, '../index.ts'),
  'utf8',
);

describe('cleanup-idempotency-keys EF — Phase 2.1 ai_lookup_logs extension', () => {
  it('references the ai_lookup_logs table', () => {
    expect(EF_SOURCE).toMatch(/from\(['"]ai_lookup_logs['"]\)/);
  });

  it('applies the 24h created_at cutoff to ai_lookup_logs (matches chat_messages + routine_generations)', () => {
    // Find the ai_lookup_logs block; it must use the same cutoffIso
    // filter as the prior two blocks.
    const aiBlockMatch = EF_SOURCE.match(
      /\.from\(['"]ai_lookup_logs['"]\)[\s\S]{0,400}?\.select/,
    );
    expect(aiBlockMatch).not.toBeNull();
    expect(aiBlockMatch![0]).toMatch(/\.lt\(['"]created_at['"], cutoffIso\)/);
    expect(aiBlockMatch![0]).toMatch(
      /\.not\(['"]idempotency_key['"], ['"]is['"], null\)/,
    );
  });

  it('NULLs the idempotency_key column (NOT deletes the row — quota log preservation)', () => {
    const aiBlockMatch = EF_SOURCE.match(
      /\.from\(['"]ai_lookup_logs['"]\)[\s\S]{0,400}?\.select/,
    );
    expect(aiBlockMatch).not.toBeNull();
    expect(aiBlockMatch![0]).toMatch(
      /\.update\(\{\s*idempotency_key:\s*null\s*\}\)/,
    );
  });

  it('return body includes cleared_ai_lookup_logs alongside the existing two counters', () => {
    expect(EF_SOURCE).toMatch(/cleared_chat_messages/);
    expect(EF_SOURCE).toMatch(/cleared_routine_generations/);
    expect(EF_SOURCE).toMatch(/cleared_ai_lookup_logs/);
  });

  it('error-handling block exists for the new table (matches the prior two patterns)', () => {
    // The chat + routine blocks each have a `if (chatError) ... 500`
    // / `if (routineError) ... 500` guard. The new block must do the
    // same so a service-role permission glitch or table-missing
    // failure surfaces as a 500, not a silent partial.
    expect(EF_SOURCE).toMatch(/lookupError[\s\S]{0,200}500/);
  });
});
