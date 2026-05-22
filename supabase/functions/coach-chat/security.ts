// v1.5 Phase 2.7 Sprint 2.7.2 — re-export shim.
//
// The Drafting 172 helpers (L4 length cap + jailbreak hint + L5 secret
// scrub) lifted to `../_shared/llmSecurity.ts` so every sister EF in
// the chat family can share them (Drafting 173 fan-out). This file is
// the legacy import path for `coach-chat/index.ts` and the two
// existing test files (`__tests__/security.test.ts` + `redTeam.test.ts`);
// pointing them at the shared module via `export *` keeps every diff
// minimal while the fan-out lands.

export * from '../_shared/llmSecurity.ts';
