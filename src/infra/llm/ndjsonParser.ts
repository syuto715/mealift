// v1.5 Stage 1 Phase 1.1 — NDJSON line parser.
//
// Architectural SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3
// (NDJSON wire vocabulary) + §4.3 (streaming surface).
//
// Wire contract (§3):
//   - Content-Type: application/x-ndjson
//   - Body is a byte stream of newline-terminated JSON objects.
//   - Server MUST flush a trailing `\n` after the final event
//     (done or error) before closing the connection.
//   - Client splits on `\n` and JSON-parses each complete line.
//   - The unterminated trailing remainder on TCP close is NOT
//     flushed — its absence already implies transport loss; the
//     correct outcome is the `partial` classification, never a
//     synthetic done/error reconstruction.
//
// This module is a pure transform (Drafting 25 helper-thick): no
// fetch, no React, no Deno; jest-testable in node env.

import type { AIErrorCode } from '../services/aiNutritionService';

export interface NDJSONMeta {
  event: 'meta';
  assistantMessageId: string;
  conversationId: string;
  model: string;
}

export interface NDJSONChunk {
  event: 'chunk';
  delta: string;
}

export interface NDJSONDone {
  event: 'done';
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: 'stop' | 'length' | 'safety';
}

export interface NDJSONError {
  event: 'error';
  code: AIErrorCode;
  message: string;
  recoverable: boolean;
}

export type NDJSONEvent =
  | NDJSONMeta
  | NDJSONChunk
  | NDJSONDone
  | NDJSONError;

export type ParsedLine =
  | { kind: 'event'; event: NDJSONEvent }
  | { kind: 'malformed'; raw: string; reason: string };

/** Parses a single newline-stripped JSON line into a discriminated
 *  `NDJSONEvent`. Malformed lines are returned as a `malformed`
 *  variant rather than thrown — the upstream stream consumer
 *  decides whether a malformed line is fatal or skippable. */
export function parseNDJSONLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { kind: 'malformed', raw: line, reason: 'empty line' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return {
      kind: 'malformed',
      raw: line,
      reason: e instanceof Error ? e.message : 'JSON.parse threw',
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      kind: 'malformed',
      raw: line,
      reason: 'not a JSON object',
    };
  }
  const event = (parsed as Record<string, unknown>).event;
  if (event === 'meta') {
    return validateMeta(parsed as Record<string, unknown>, line);
  }
  if (event === 'chunk') {
    return validateChunk(parsed as Record<string, unknown>, line);
  }
  if (event === 'done') {
    return validateDone(parsed as Record<string, unknown>, line);
  }
  if (event === 'error') {
    return validateError(parsed as Record<string, unknown>, line);
  }
  return {
    kind: 'malformed',
    raw: line,
    reason: `unknown event discriminator: ${JSON.stringify(event)}`,
  };
}

function validateMeta(o: Record<string, unknown>, raw: string): ParsedLine {
  if (
    typeof o.assistantMessageId !== 'string' ||
    typeof o.conversationId !== 'string' ||
    typeof o.model !== 'string'
  ) {
    return { kind: 'malformed', raw, reason: 'meta missing required fields' };
  }
  return {
    kind: 'event',
    event: {
      event: 'meta',
      assistantMessageId: o.assistantMessageId,
      conversationId: o.conversationId,
      model: o.model,
    },
  };
}

function validateChunk(
  o: Record<string, unknown>,
  raw: string,
): ParsedLine {
  if (typeof o.delta !== 'string') {
    return { kind: 'malformed', raw, reason: 'chunk.delta not a string' };
  }
  return { kind: 'event', event: { event: 'chunk', delta: o.delta } };
}

function validateDone(o: Record<string, unknown>, raw: string): ParsedLine {
  if (
    typeof o.inputTokens !== 'number' ||
    typeof o.outputTokens !== 'number' ||
    typeof o.model !== 'string'
  ) {
    return { kind: 'malformed', raw, reason: 'done missing required fields' };
  }
  const finishReason = o.finishReason;
  if (
    finishReason !== 'stop' &&
    finishReason !== 'length' &&
    finishReason !== 'safety'
  ) {
    return {
      kind: 'malformed',
      raw,
      reason: `done.finishReason invalid: ${JSON.stringify(finishReason)}`,
    };
  }
  return {
    kind: 'event',
    event: {
      event: 'done',
      inputTokens: o.inputTokens,
      outputTokens: o.outputTokens,
      model: o.model,
      finishReason,
    },
  };
}

function validateError(o: Record<string, unknown>, raw: string): ParsedLine {
  if (
    typeof o.code !== 'string' ||
    typeof o.message !== 'string' ||
    typeof o.recoverable !== 'boolean'
  ) {
    return {
      kind: 'malformed',
      raw,
      reason: 'error missing required fields',
    };
  }
  return {
    kind: 'event',
    event: {
      event: 'error',
      code: o.code as AIErrorCode,
      message: o.message,
      recoverable: o.recoverable,
    },
  };
}

// =====================================================================
// Streaming buffer (separates split-on-newline from byte decoding)
// =====================================================================

/** Stateful buffer for parsing an NDJSON byte stream.
 *
 *  Usage:
 *    const buffer = new NDJSONBuffer();
 *    while (!done) {
 *      const { value } = await reader.read();
 *      const lines = buffer.feed(value);
 *      for (const line of lines) { ... parseNDJSONLine(line) ... }
 *    }
 *    // After EOF, do NOT call flush() — the §3 EOF contract
 *    // intentionally drops any unterminated trailing remainder.
 */
export class NDJSONBuffer {
  private decoder = new TextDecoder('utf-8');
  private remainder = '';

  /** Feeds a Uint8Array chunk and returns zero-or-more complete
   *  lines (newline-stripped) ready to hand to `parseNDJSONLine`. */
  feed(chunk: Uint8Array | undefined): string[] {
    if (!chunk || chunk.byteLength === 0) return [];
    const decoded = this.decoder.decode(chunk, { stream: true });
    this.remainder += decoded;
    const out: string[] = [];
    let nl = this.remainder.indexOf('\n');
    while (nl !== -1) {
      const line = this.remainder.slice(0, nl);
      this.remainder = this.remainder.slice(nl + 1);
      out.push(line);
      nl = this.remainder.indexOf('\n');
    }
    return out;
  }

  /** Exposed for tests — production callers don't flush on EOF,
   *  per the §3 EOF contract (unterminated trailing remainder is
   *  treated as transport loss). */
  unsafeFlushForTest(): string {
    const r = this.remainder;
    this.remainder = '';
    return r;
  }
}
