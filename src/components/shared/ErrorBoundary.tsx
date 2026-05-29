import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// v1.5.2-A Fix 3 (限定保険) — root-level React error boundary.
//
// SCOPE LIMIT (must not be overclaimed): a React ErrorBoundary only catches
// errors thrown synchronously inside the React render / lifecycle of its
// descendants (componentDidCatch / getDerivedStateFromError). It does NOT
// catch:
//   - Hermes native memory-access violations (EXC_BAD_ACCESS / SIGSEGV) — the
//     incident 2726719B crash class. A native segfault tears down the JS VM
//     before any JS catch handler runs, so this boundary cannot recover from
//     it. The actual mitigation for that crash is Fix 1 (selector stability).
//   - Errors in event handlers, async callbacks, timers, or the native layer.
//
// This boundary is a generic safety net for *JS-level* render throws so a
// future component bug shows a recoverable fallback instead of a white screen.
// It is intentionally dependency-free (no theme tokens) so it can render even
// if a provider above it failed.

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surfaced to Metro / device logs. No PII — error message + component
    // stack only. Kept as console.error so it lands in the same place the
    // v1.5.2 instrumentation breadcrumbs are read from.
    console.error('[ErrorBoundary] caught a JS render error', error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>問題が発生しました</Text>
          <Text style={styles.body}>
            画面の表示中にエラーが発生しました。 もう一度お試しください。
          </Text>
          <TouchableOpacity
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="再試行"
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>再試行</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 9999,
    backgroundColor: '#111111',
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
