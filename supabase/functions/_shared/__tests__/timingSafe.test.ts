import { constantTimeEqual } from '../timingSafe';

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('s3cr3t-abc', 's3cr3t-abc')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
  });
  it('returns false for different same-length strings', () => {
    expect(constantTimeEqual('s3cr3t-abc', 's3cr3t-abd')).toBe(false);
  });
  it('returns false for different-length strings (no early-exit crash)', () => {
    expect(constantTimeEqual('short', 'a-much-longer-secret')).toBe(false);
    expect(constantTimeEqual('a-much-longer-secret', 'short')).toBe(false);
    expect(constantTimeEqual('x', '')).toBe(false);
  });
  it('handles multibyte content', () => {
    expect(constantTimeEqual('トークン', 'トークン')).toBe(true);
    // same byte length (3 bytes/char), differing last char → false
    expect(constantTimeEqual('トークン', 'トークソ')).toBe(false);
  });
});
