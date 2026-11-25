import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAILING_WINDOW_SECONDS,
  classifyHeartTrend,
  createTrailingAverageTracker,
} from '../landing/heart-trend-tracker.js';

test('30-second trailing average absorbs short transient spikes without overreacting', () => {
  const tracker = createTrailingAverageTracker({
    windowSeconds: 30,
    sampleRateHz: 60,
    initialBpm: 62,
  });

  assert.equal(tracker.windowSeconds, TRAILING_WINDOW_SECONDS);
  assert.equal(tracker.capacity, 1800);
  assert.equal(tracker.getState().trailingAvgBpm, 62);
  assert.equal(tracker.getState().status, 'steady');

  // Inject a sharp 1.5-second transient spike (+30 BPM -> 92 BPM)
  let state = tracker.getState();
  for (let i = 0; i < 90; i++) {
    state = tracker.pushSample(92);
  }

  // Over 30s, 1.5s of +30 BPM raises the trailing average by only +1.5 BPM
  assert.ok(Math.abs(state.trailingAvgBpm - 63.5) < 0.05);
  assert.equal(state.status, 'transient-spike');
  assert.equal(state.label, 'TRANSIENT SPIKE');
});

test('30-second trailing average converges on sustained elevated load and flags >140 BPM critical trend', () => {
  const tracker = createTrailingAverageTracker({
    windowSeconds: 30,
    sampleRateHz: 10,
    initialBpm: 62,
  });

  // 15 seconds (half window) at sustained 142 BPM -> average reaches halfway (~102 BPM)
  let state = tracker.getState();
  for (let i = 0; i < 150; i++) {
    state = tracker.pushSample(142);
  }
  assert.ok(Math.abs(state.trailingAvgBpm - 102) < 0.1);
  assert.equal(state.status, 'transient-spike');
  assert.equal(state.label, 'TRANSIENT >140 SPIKE');

  // Full 30 seconds at sustained 142 BPM -> average converges to 142 BPM -> sustained critical
  for (let i = 0; i < 150; i++) {
    state = tracker.pushSample(142);
  }
  assert.ok(Math.abs(state.trailingAvgBpm - 142) < 0.05);
  assert.equal(state.status, 'sustained-critical');
  assert.equal(state.label, 'SUSTAINED >140 BPM');
});

test('classifyHeartTrend distinguishes cooling recovery and sustained elevated trends', () => {
  const cooling = classifyHeartTrend({ instantBpm: 62, trailingAvgBpm: 112 });
  assert.equal(cooling.status, 'recovering');
  assert.equal(cooling.label, 'COOLING DOWN');

  const sustained = classifyHeartTrend({ instantBpm: 118, trailingAvgBpm: 116 });
  assert.equal(sustained.status, 'sustained-elevated');
  assert.equal(sustained.label, 'SUSTAINED ELEVATED');
});
