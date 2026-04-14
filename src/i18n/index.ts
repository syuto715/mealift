export { ja } from './ja';
export type { TranslationKey } from './ja';

// Single-language for now (Japanese only)
export const t = (key: string): string => {
  const keys = key.split('.');
  let current: unknown = require('./ja').ja;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
};
