import { useEffect, useState } from 'react';

// v1.5 Phase 2.3 Sprint 2.3.2 — debounced-value hook.
//
// Keeps the latest input value but only commits it to the returned
// state after `delayMs` have elapsed without further changes. Used
// by the search store / TanStack Query wire-up to avoid firing one
// FTS5 query per keystroke.

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
