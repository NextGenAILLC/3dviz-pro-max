import test from 'node:test';
import assert from 'node:assert/strict';
import { HRV_PROFILES, createStochasticHrvEngine } from '../landing/heart-hrv-engine.js';

test('stochastic HRV engine produces non-periodic bounded micro-fluctuations', () => {
  const engine = createStochasticHrvEngine({ initialProfile: 'sleep-debt', seed: 42 });
  const cfg = HRV_PROFILES['sleep-debt'];

  const bpmDeltas = [];
  const micros = [];
  const rScales = new Set();

  for (let i = 0; i < 360; i++) {
    const s = engine.step(1 / 60, { baseBpm: 118, beatWrapped: i % 30 === 0 });
    assert.ok(Math.abs(s.bpmDelta) <= cfg.maxBpmDelta + 1e-9);
    assert.ok(Math.abs(s.baselineMicro) <= cfg.maxMicro + 1e-9);
    assert.ok(s.bandSpreadBpm >= 2.4 && s.bandSpreadBpm <= 14);
    bpmDeltas.push(s.bpmDelta);
    micros.push(s.baselineMicro);
    rScales.add(s.rAmpScale.toFixed(4));
  }

  // Confirm genuine stochastic variation across beats and samples (never flat or frozen)
  const uniqueDeltas = new Set(bpmDeltas.map((v) => v.toFixed(3)));
  assert.ok(uniqueDeltas.size > 100);
  assert.ok(rScales.size >= 6);
});

test('stress and sleep-debt profiles exhibit stronger micro-fluctuation variance and lower RMSSD than baseline', () => {
  const baseEngine = createStochasticHrvEngine({ initialProfile: 'baseline', seed: 101 });
  const stressEngine = createStochasticHrvEngine({ initialProfile: 'sleep-debt', seed: 101 });

  let baseMicroEnergy = 0;
  let stressMicroEnergy = 0;
  let baseState = baseEngine.getState();
  let stressState = stressEngine.getState();

  for (let i = 0; i < 600; i++) {
    baseState = baseEngine.step(1 / 60, { baseBpm: 62, beatWrapped: i % 58 === 0 });
    stressState = stressEngine.step(1 / 60, { baseBpm: 118, beatWrapped: i % 30 === 0 });
    baseMicroEnergy += Math.abs(baseState.baselineMicro);
    stressMicroEnergy += Math.abs(stressState.baselineMicro);
  }

  assert.ok(stressMicroEnergy > baseMicroEnergy * 1.8);
  assert.ok(baseState.rmssdMs > stressState.rmssdMs);
  assert.ok(stressState.bandSpreadBpm > baseState.bandSpreadBpm);
});

test('setProfile shifts autonomic regime smoothly and ignores unknown profile IDs', () => {
  const engine = createStochasticHrvEngine({ initialProfile: 'baseline', seed: 7 });
  const before = engine.getState();
  assert.equal(before.profileId, 'baseline');

  const unchanged = engine.setProfile('not-a-real-profile');
  assert.equal(unchanged.profileId, 'baseline');

  const shifted = engine.setProfile('tactical');
  assert.equal(shifted.profileId, 'tactical');
  assert.ok(shifted.rmssdMs < before.rmssdMs);
});
