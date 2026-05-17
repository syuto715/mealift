// v1.5 Stage 1 Phase 1.1 — NDJSON parser tests.

import { NDJSONBuffer, parseNDJSONLine } from '../ndjsonParser';

describe('parseNDJSONLine — meta', () => {
  it('parses a well-formed meta event', () => {
    const r = parseNDJSONLine(
      JSON.stringify({
        event: 'meta',
        assistantMessageId: 'a-1',
        conversationId: 'c-1',
        model: 'gemini-2.5-flash',
      }),
    );
    expect(r.kind).toBe('event');
    if (r.kind === 'event') {
      expect(r.event.event).toBe('meta');
    }
  });

  it('rejects meta without assistantMessageId', () => {
    const r = parseNDJSONLine(
      JSON.stringify({
        event: 'meta',
        conversationId: 'c-1',
        model: 'gemini-2.5-flash',
      }),
    );
    expect(r.kind).toBe('malformed');
  });
});

describe('parseNDJSONLine — chunk', () => {
  it('parses a well-formed chunk', () => {
    const r = parseNDJSONLine(
      JSON.stringify({ event: 'chunk', delta: 'こんにちは' }),
    );
    expect(r.kind).toBe('event');
    if (r.kind === 'event' && r.event.event === 'chunk') {
      expect(r.event.delta).toBe('こんにちは');
    }
  });

  it('rejects chunk with non-string delta', () => {
    const r = parseNDJSONLine(JSON.stringify({ event: 'chunk', delta: 123 }));
    expect(r.kind).toBe('malformed');
  });
});

describe('parseNDJSONLine — done', () => {
  it('parses a well-formed done event', () => {
    const r = parseNDJSONLine(
      JSON.stringify({
        event: 'done',
        inputTokens: 100,
        outputTokens: 50,
        model: 'gemini-2.5-flash',
        finishReason: 'stop',
      }),
    );
    expect(r.kind).toBe('event');
  });

  it('rejects done with invalid finishReason', () => {
    const r = parseNDJSONLine(
      JSON.stringify({
        event: 'done',
        inputTokens: 100,
        outputTokens: 50,
        model: 'gemini-2.5-flash',
        finishReason: 'truncated',
      }),
    );
    expect(r.kind).toBe('malformed');
  });
});

describe('parseNDJSONLine — error', () => {
  it('parses a well-formed error event', () => {
    const r = parseNDJSONLine(
      JSON.stringify({
        event: 'error',
        code: 'gemini_error',
        message: 'AI 応答に失敗しました',
        recoverable: false,
      }),
    );
    expect(r.kind).toBe('event');
    if (r.kind === 'event' && r.event.event === 'error') {
      expect(r.event.code).toBe('gemini_error');
    }
  });

  it('rejects error with non-boolean recoverable', () => {
    const r = parseNDJSONLine(
      JSON.stringify({
        event: 'error',
        code: 'gemini_error',
        message: 'oops',
        recoverable: 'maybe',
      }),
    );
    expect(r.kind).toBe('malformed');
  });
});

describe('parseNDJSONLine — malformed', () => {
  it('returns malformed for empty line', () => {
    expect(parseNDJSONLine('').kind).toBe('malformed');
  });

  it('returns malformed for non-JSON', () => {
    expect(parseNDJSONLine('not json').kind).toBe('malformed');
  });

  it('returns malformed for unknown event', () => {
    const r = parseNDJSONLine(JSON.stringify({ event: 'mystery' }));
    expect(r.kind).toBe('malformed');
  });
});

describe('NDJSONBuffer', () => {
  it('emits complete lines on newline-terminated chunks', () => {
    const buf = new NDJSONBuffer();
    const enc = new TextEncoder();
    const lines = buf.feed(
      enc.encode('{"event":"chunk","delta":"a"}\n{"event":"chunk","delta":"b"}\n'),
    );
    expect(lines).toHaveLength(2);
  });

  it('holds partial bytes across feed() calls', () => {
    const buf = new NDJSONBuffer();
    const enc = new TextEncoder();
    let lines = buf.feed(enc.encode('{"event":"chu'));
    expect(lines).toHaveLength(0);
    lines = buf.feed(enc.encode('nk","delta":"hi"}\n'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('{"event":"chunk","delta":"hi"}');
  });

  it('does NOT auto-flush an unterminated trailing chunk (§3 EOF)', () => {
    const buf = new NDJSONBuffer();
    const enc = new TextEncoder();
    const lines = buf.feed(enc.encode('{"event":"chunk","delta":"oops"}'));
    expect(lines).toHaveLength(0);
    // The unsafeFlushForTest helper is the only way to inspect the
    // remainder — production code never reads it on EOF.
    expect(buf.unsafeFlushForTest()).toBe(
      '{"event":"chunk","delta":"oops"}',
    );
  });

  it('handles multi-byte UTF-8 split across chunks', () => {
    const buf = new NDJSONBuffer();
    const full = '{"event":"chunk","delta":"あ"}\n';
    const bytes = new TextEncoder().encode(full);
    const splitAt = Math.floor(bytes.length / 2);
    const part1 = bytes.slice(0, splitAt);
    const part2 = bytes.slice(splitAt);
    expect(buf.feed(part1)).toHaveLength(0);
    const lines = buf.feed(part2);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).delta).toBe('あ');
  });

  it('handles empty / undefined feeds gracefully', () => {
    const buf = new NDJSONBuffer();
    expect(buf.feed(undefined)).toEqual([]);
    expect(buf.feed(new Uint8Array(0))).toEqual([]);
  });
});
