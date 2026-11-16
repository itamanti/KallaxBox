/**
 * Creates an AbortSignal that aborts after `ms` milliseconds.
 * Compatible with older iOS Safari (<16) and Android Chrome (<103)
 * where AbortSignal.timeout is unavailable.
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
    return (AbortSignal as any).timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }, ms);
  return controller.signal;
}
