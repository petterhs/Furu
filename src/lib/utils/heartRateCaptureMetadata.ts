/** Test configuration actually observed in measuring diagnostic packets. */
export type CaptureConfiguration = { profile: string; gain: number; ledCurrentMa: number | null };
export function diagnosticConfiguration(bytes: readonly number[]): CaptureConfiguration | null {
  if (bytes.length !== 20 || bytes[1] !== 1 || ((bytes[4] | bytes[5] << 8) & 0xfff) === 0) return null;
  const code = bytes[5] >> 4;
  if (bytes[0] === 4 && code <= 3) {
    return { profile: 'ABCD'[code], gain: [2, 4, 2, 4][code], ledCurrentMa: code < 2 ? 12.5 : 20 };
  }
  if (bytes[0] === 3 && [1, 2, 4, 8].includes(code)) return { profile: 'legacy', gain: code, ledCurrentMa: null };
  return null;
}
export function observedConfigurations(samples: readonly { source: string; bytes: readonly number[] }[]): CaptureConfiguration[] {
  const found = new Map<string, CaptureConfiguration>();
  for (const sample of samples) {
    const config = sample.source === 'diagnostics' ? diagnosticConfiguration(sample.bytes) : null;
    if (config) found.set(configurationLabel(config), config);
  }
  return [...found.values()].sort((a, b) => configurationLabel(a).localeCompare(configurationLabel(b)));
}
export function configurationLabel(config: CaptureConfiguration): string {
  return `${config.profile}-g${config.gain}-led${config.ledCurrentMa === null ? 'unknown' : String(config.ledCurrentMa).replace('.', 'p') + 'mA'}`;
}
export function captureFilename(firmware: string | null, configurations: CaptureConfiguration[], stamp: string, format: 'csv' | 'json'): string {
  const revision = (firmware || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64);
  const profiles = configurations.map(configurationLabel).join('_') || 'config-unknown';
  return `furu-hr-capture-fw-${revision}-${profiles}-${stamp}.${format}`;
}
