import { useSubmissionScanStore } from '../submissionScanStore';

// Pure logic tests for the barcode handoff store. No React render —
// just exercises the set / consume / clear contract. The store is
// tiny but the consume-then-clear atomicity is the bug-prone bit
// (StrictMode / fast refresh can fire effects twice; consume must
// return the value once and null on the second call).

beforeEach(() => {
  // Reset the store between tests so leftover state doesn't bleed.
  useSubmissionScanStore.setState({ pendingBarcode: null });
});

describe('useSubmissionScanStore', () => {
  it('starts with no pending barcode', () => {
    expect(useSubmissionScanStore.getState().pendingBarcode).toBeNull();
  });

  it('setPendingBarcode stores the value', () => {
    useSubmissionScanStore.getState().setPendingBarcode('4901234567890');
    expect(useSubmissionScanStore.getState().pendingBarcode).toBe(
      '4901234567890',
    );
  });

  it('consumePendingBarcode returns the value AND clears it', () => {
    useSubmissionScanStore.getState().setPendingBarcode('4901234567890');
    const consumed = useSubmissionScanStore.getState().consumePendingBarcode();
    expect(consumed).toBe('4901234567890');
    expect(useSubmissionScanStore.getState().pendingBarcode).toBeNull();
  });

  it('consume returns null when nothing is pending', () => {
    expect(
      useSubmissionScanStore.getState().consumePendingBarcode(),
    ).toBeNull();
  });

  it('a second consume after the first returns null (one-shot)', () => {
    useSubmissionScanStore.getState().setPendingBarcode('4901234567890');
    const first = useSubmissionScanStore.getState().consumePendingBarcode();
    const second = useSubmissionScanStore.getState().consumePendingBarcode();
    expect(first).toBe('4901234567890');
    expect(second).toBeNull();
  });

  it('overwrites an existing pending value when set is called twice', () => {
    useSubmissionScanStore.getState().setPendingBarcode('1111111111111');
    useSubmissionScanStore.getState().setPendingBarcode('4901234567890');
    expect(useSubmissionScanStore.getState().pendingBarcode).toBe(
      '4901234567890',
    );
  });
});
