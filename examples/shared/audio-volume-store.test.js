import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PULSE_VOLUME,
  clampVolume,
  volumeToGain,
  getGlobalPulseVolume,
  setGlobalPulseVolume,
  nudgeGlobalPulseVolume,
  toggleGlobalPulseMute,
  subscribeGlobalPulseVolume,
} from './audio-volume-store.js';

test('clampVolume bounds values to [0, 1] and falls back safely on invalid input', () => {
  assert.equal(clampVolume(-0.5), 0);
  assert.equal(clampVolume(1.8), 1);
  assert.equal(clampVolume(0.426), 0.43);
  assert.equal(clampVolume(Number.NaN), DEFAULT_PULSE_VOLUME);
  assert.equal(clampVolume('bad'), DEFAULT_PULSE_VOLUME);
});

test('volumeToGain applies monotonic perceptual gain curve from 0 to 1', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(1), 1);
  const low = volumeToGain(0.25);
  const mid = volumeToGain(0.5);
  const high = volumeToGain(0.75);
  assert.ok(low > 0 && low < 0.25);
  assert.ok(low < mid && mid < high && high < 1);
});

test('global pulse volume notifies subscribers, nudges cleanly, and restores level on unmute', () => {
  const seen = [];
  const unsub = subscribeGlobalPulseVolume((snap) => seen.push(snap));

  try {
    setGlobalPulseVolume(0.6, { persist: false });
    assert.equal(getGlobalPulseVolume(), 0.6);

    const mutedSnap = toggleGlobalPulseMute();
    assert.equal(mutedSnap.volume, 0);
    assert.equal(mutedSnap.muted, true);
    assert.equal(mutedSnap.gain, 0);

    const restoredSnap = toggleGlobalPulseMute();
    assert.equal(restoredSnap.volume, 0.6);
    assert.equal(restoredSnap.muted, false);

    const nudged = nudgeGlobalPulseVolume(0.15);
    assert.equal(nudged.percent, 75);
    assert.ok(seen.length >= 3);
  } finally {
    unsub();
    setGlobalPulseVolume(DEFAULT_PULSE_VOLUME, { persist: false });
  }
});
