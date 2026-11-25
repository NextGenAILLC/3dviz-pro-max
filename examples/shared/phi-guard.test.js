import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPhiPatterns, redactPhi, parseSafeQuery } from './phi-guard.js';

test('phi-guard blocks SSN, MRN, email, phone, and DOB patterns', () => {
  const sample = 'Patient: Jane Doe MRN-88421 SSN 123-45-6789 DOB: 04/12/1988 jane@clinic.org 555-234-5678';
  const reasons = detectPhiPatterns(sample);
  assert.ok(reasons.includes('SSN'));
  assert.ok(reasons.includes('MRN'));
  assert.ok(reasons.includes('EMAIL'));
  assert.ok(reasons.includes('PHONE'));

  const result = redactPhi(sample);
  assert.equal(result.blocked, true);
  assert.equal(result.sanitized.includes('123-45-6789'), false);
  assert.equal(result.sanitized.includes('jane@clinic.org'), false);
  assert.equal(result.sanitized.includes('555-234-5678'), false);
});

test('phi-guard allows clean anatomical and study search terms', () => {
  const clean = redactPhi('heart coronary knee sarcomere');
  assert.equal(clean.blocked, false);
  assert.equal(clean.sanitized, 'heart coronary knee sarcomere');
});

test('parseSafeQuery enforces strict enum allowlists and drops unknown keys', () => {
  const safe = parseSafeQuery('?profile=sleep-debt&lens=injury&patientName=JohnDoe&skipIntro=1');
  assert.equal(safe.profile, 'sleep-debt');
  assert.equal(safe.lens, 'injury');
  assert.equal(safe.skipIntro, true);
  assert.equal('patientName' in safe, false);

  const fallback = parseSafeQuery('?profile=arbitrary-injection&lens=unknown');
  assert.equal(fallback.profile, null);
  assert.equal(fallback.lens, 'all');
});
