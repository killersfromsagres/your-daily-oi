/** Interpret HLS loading errors without mistaking a short segment delay for denial. */
export function terminalHlsLoadFailure(status: number, detail: string, fatal: boolean): boolean {
  if (fatal) return true;
  if ([401, 403, 410, 429].includes(status)) return true;
  // A single expired/disappearing segment can be retried by Hls.js.
  // A missing manifest/level/key cannot be recovered by retrying fragments.
  return status === 404 && /manifest|level|key/i.test(detail);
}

export function accessDeniedLiveSource(status: number, detail: string): boolean {
  return [401, 403, 410].includes(status) ||
    (status === 404 && /manifest|level|key/i.test(detail));
}
