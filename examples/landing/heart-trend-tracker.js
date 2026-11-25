export const TRAILING_WINDOW_SECONDS = 30;
export const DEFAULT_SUSTAINED_ELEVATED_BPM = 100;
export const DEFAULT_CRITICAL_BPM = 140;

/**
 * Classifies whether current heart rate reflects a transient spike,
 * sustained elevated load, sustained critical load (>140 BPM), cooling recovery, or steady baseline.
 */
export function classifyHeartTrend({
  instantBpm,
  trailingAvgBpm,
  sustainedThreshold = DEFAULT_SUSTAINED_ELEVATED_BPM,
  criticalThreshold = DEFAULT_CRITICAL_BPM,
}) {
  const deltaBpm = instantBpm - trailingAvgBpm;

  if (trailingAvgBpm > criticalThreshold) {
    return {
      status: 'sustained-critical',
      label: 'SUSTAINED >140 BPM',
    };
  }

  if (deltaBpm >= 9) {
    return {
      status: 'transient-spike',
      label: instantBpm > criticalThreshold ? 'TRANSIENT >140 SPIKE' : 'TRANSIENT SPIKE',
    };
  }

  if (deltaBpm <= -9) {
    return {
      status: 'recovering',
      label: 'COOLING DOWN',
    };
  }

  if (trailingAvgBpm >= sustainedThreshold) {
    return {
      status: 'sustained-elevated',
      label: 'SUSTAINED ELEVATED',
    };
  }

  return {
    status: 'steady',
    label: 'STEADY BASELINE',
  };
}

/**
 * Fixed-window O(1) circular ring buffer computing an exact trailing moving average
 * over `windowSeconds` at `sampleRateHz` samples/sec (default: 30 seconds = 1800 samples).
 */
export function createTrailingAverageTracker({
  windowSeconds = TRAILING_WINDOW_SECONDS,
  sampleRateHz = 60,
  initialBpm = 118,
  sustainedThreshold = DEFAULT_SUSTAINED_ELEVATED_BPM,
  criticalThreshold = DEFAULT_CRITICAL_BPM,
} = {}) {
  const safeWindow = Math.max(1, Number(windowSeconds) || TRAILING_WINDOW_SECONDS);
  const safeRate = Math.max(1, Math.round(Number(sampleRateHz) || 60));
  const capacity = Math.max(1, Math.round(safeWindow * safeRate));

  const ring = new Float64Array(capacity);
  let cursor = 0;
  let runningSum = 0;
  let pushCount = 0;
  let lastInstantBpm = initialBpm;

  function seed(bpm) {
    const clamped = Number.isFinite(bpm) ? bpm : 72;
    ring.fill(clamped);
    runningSum = clamped * capacity;
    cursor = 0;
    pushCount = 0;
    lastInstantBpm = clamped;
  }

  function recomputeSum() {
    let total = 0;
    for (let i = 0; i < capacity; i++) {
      total += ring[i];
    }
    runningSum = total;
  }

  function buildState() {
    const trailingAvgBpm = runningSum / capacity;
    const deltaBpm = lastInstantBpm - trailingAvgBpm;
    const classification = classifyHeartTrend({
      instantBpm: lastInstantBpm,
      trailingAvgBpm,
      sustainedThreshold,
      criticalThreshold,
    });

    return {
      instantBpm: lastInstantBpm,
      trailingAvgBpm,
      deltaBpm,
      windowSeconds: safeWindow,
      status: classification.status,
      label: classification.label,
    };
  }

  seed(initialBpm);

  return {
    capacity,
    windowSeconds: safeWindow,
    pushSample(instantBpm) {
      const value = Number.isFinite(instantBpm) ? instantBpm : lastInstantBpm;
      const evicted = ring[cursor];
      ring[cursor] = value;
      runningSum += value - evicted;
      cursor = (cursor + 1) % capacity;
      lastInstantBpm = value;
      pushCount += 1;

      if (pushCount % capacity === 0) {
        recomputeSum();
      }

      return buildState();
    },
    reset(bpm) {
      seed(bpm);
      return buildState();
    },
    getState() {
      return buildState();
    },
  };
}
