import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { diagnosticConfiguration, observedConfigurations, captureFilename } from '../src/lib/utils/heartRateCaptureMetadata.ts';
const packet = (version, profile, phase = 1, count = 1) => [version, phase, 0, 0, count, profile << 4, ...Array(14).fill(0)];
test('v4 identifies every gain/current combination; legacy current stays unknown', () => {
  for (let id = 0; id < 4; id++) assert.deepEqual(diagnosticConfiguration(packet(4,id)), {
    profile: 'ABCD'[id], gain: [2,4,2,4][id], ledCurrentMa: id < 2 ? 12.5 : 20,
  });
  assert.equal(diagnosticConfiguration(packet(3,2)).ledCurrentMa, null);
  assert.equal(diagnosticConfiguration(packet(4,4)), null);
  assert.equal(diagnosticConfiguration(packet(4,0,2)), null);
  assert.equal(diagnosticConfiguration(packet(4,0,1,0)), null);
});
test('filenames retain device revision and every observed profile, not a stale idle packet', () => {
  const configs = observedConfigurations([
    {source:'diagnostics', bytes:packet(4,2,2)},
    ...[3,0,3].map(id => ({source:'diagnostics', bytes:packet(4,id)})),
  ]);
  assert.equal(configs.length, 2);
  const name = captureFilename('0.4.0+abcdef1',configs,'2026-11-13','csv');
  assert.match(name, /0.4.0-abcdef1-A-g2-led12p5mA_D-g4-led20mA/);
  assert.match(captureFilename(null,[],'stamp','json'), /fw-unknown-config-unknown/);
  assert.equal(captureFilename('../../bad/name',[],'stamp','csv').includes('/'), false);
});
