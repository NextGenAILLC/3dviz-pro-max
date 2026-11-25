import test from 'node:test';
import assert from 'node:assert/strict';
import { getTacticalRecoverySnapshot } from '../landing/tactical-recovery.js';

test('tactical recovery dynamically scales readiness and recovery window by active load profile', () => {
  const baseline = getTacticalRecoverySnapshot('knee-cut-load', 'baseline');
  const sleepDebt = getTacticalRecoverySnapshot('knee-cut-load', 'sleep-debt');
  const tactical = getTacticalRecoverySnapshot('knee-cut-load', 'tactical');

  assert.ok(baseline && sleepDebt && tactical);
  assert.equal(baseline.tone, 'nominal');
  assert.equal(sleepDebt.tone, 'elevated');
  assert.equal(tactical.tone, 'critical');
  assert.ok(baseline.readinessPct > sleepDebt.readinessPct);
  assert.ok(sleepDebt.readinessPct > tactical.readinessPct);
  assert.match(sleepDebt.meta, /SYNTHETIC REDACTED · ZERO PHI/);
  assert.match(sleepDebt.injuryPrevention, /ACL|plyometrics|cutting/i);
});

test('tactical recovery falls back cleanly on unknown profile and returns null for unknown module', () => {
  const fallback = getTacticalRecoverySnapshot('cardiac-persistence', 'unknown-profile');
  assert.ok(fallback);
  assert.equal(fallback.loadId, 'sleep-debt');
  assert.equal(getTacticalRecoverySnapshot('nonexistent-module', 'baseline'), null);
});
