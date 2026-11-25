export const HRV_PROFILES = {
  baseline: {
    targetRmssdMs: 58,
    thetaBpm: 1.35,
    sigmaBpm: 2.3,
    maxBpmDelta: 5.5,
    thetaMicro: 14,
    sigmaMicro: 0.018,
    maxMicro: 0.022,
    ampJitter: 0.032,
    phaseJitter: 0.004,
    burstChance: 0.002,
    burstScale: 0.012,
    bandFloorBpm: 3.4,
  },
  stress: {
    targetRmssdMs: 31,
    thetaBpm: 2.8,
    sigmaBpm: 3.6,
    maxBpmDelta: 7.5,
    thetaMicro: 20,
    sigmaMicro: 0.044,
    maxMicro: 0.052,
    ampJitter: 0.072,
    phaseJitter: 0.009,
    burstChance: 0.016,
    burstScale: 0.034,
    bandFloorBpm: 4.8,
  },
  'sleep-debt': {
    targetRmssdMs: 21,
    thetaBpm: 4.1,
    sigmaBpm: 4.8,
    maxBpmDelta: 9.2,
    thetaMicro: 25,
    sigmaMicro: 0.068,
    maxMicro: 0.078,
    ampJitter: 0.105,
    phaseJitter: 0.013,
    burstChance: 0.03,
    burstScale: 0.05,
    bandFloorBpm: 6.2,
  },
  tactical: {
    targetRmssdMs: 15,
    thetaBpm: 4.9,
    sigmaBpm: 5.4,
    maxBpmDelta: 8.5,
    thetaMicro: 28,
    sigmaMicro: 0.076,
    maxMicro: 0.088,
    ampJitter: 0.115,
    phaseJitter: 0.014,
    burstChance: 0.036,
    burstScale: 0.056,
    bandFloorBpm: 6.8,
  },
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Deterministic mulberry32 PRNG when a numeric seed is provided (ideal for unit tests);
 * defaults to Math.random for live non-repeating sessions.
 */
function createRandomSource(seed) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    return () => Math.random();
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a stochastic Heart Rate Variability (HRV) engine using mean-reverting
 * Ornstein-Uhlenbeck micro-fluctuations and per-beat R-R / amplitude jitter.
 * Produces organic, non-rhythmic pulse irregularity that intensifies under stress & sleep debt.
 */
export function createStochasticHrvEngine({
  initialProfile = 'sleep-debt',
  seed = null,
} = {}) {
  const rand = createRandomSource(seed);
  let spareNormal = null;

  function nextGaussian() {
    if (spareNormal !== null) {
      const value = spareNormal;
      spareNormal = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u <= 1e-7) u = rand();
    while (v <= 1e-7) v = rand();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const angle = 2.0 * Math.PI * v;
    spareNormal = mag * Math.sin(angle);
    return mag * Math.cos(angle);
  }

  let activeProfile = HRV_PROFILES[initialProfile] ? initialProfile : 'sleep-debt';
  let cfg = HRV_PROFILES[activeProfile];

  // Continuous stochastic state (Ornstein-Uhlenbeck channels)
  let bpmDelta = 0;
  let baselineMicro = 0;
  let burstEnergy = 0;
  let bandSpreadBpm = cfg.bandFloorBpm;

  // Per-beat stochastic morphology modifiers (refreshed on each R-R beat wrap)
  let rAmpScale = 1;
  let tAmpScale = 1;
  let rShift = 0;

  // Rolling inter-beat R-R intervals (ms) for organic live RMSSD calculation
  let rmssdMs = cfg.targetRmssdMs;
  const rrWindow = [];
  const MAX_RR_WINDOW = 12;

  function drawBeatMorphology(baseBpm) {
    rAmpScale = clamp(1 + nextGaussian() * cfg.ampJitter, 0.82, 1.24);
    tAmpScale = clamp(1 + nextGaussian() * (cfg.ampJitter * 0.85), 0.78, 1.26);
    rShift = clamp(nextGaussian() * cfg.phaseJitter, -0.018, 0.018);

    // Beat-to-beat instantaneous R-R interval perturbed by current stochastic BPM + sympathetic jitter
    const beatBpm = clamp(baseBpm + bpmDelta + nextGaussian() * (cfg.sigmaBpm * 0.35), 42, 165);
    const rrMs = 60000 / beatBpm;
    rrWindow.push(rrMs);
    if (rrWindow.length > MAX_RR_WINDOW) {
      rrWindow.shift();
    }

    if (rrWindow.length >= 3) {
      let sqDiffSum = 0;
      for (let i = 1; i < rrWindow.length; i++) {
        const diff = rrWindow[i] - rrWindow[i - 1];
        sqDiffSum += diff * diff;
      }
      const rawRmssd = Math.sqrt(sqDiffSum / (rrWindow.length - 1));
      // Blend measured stochastic R-R dispersion with physiological autonomic baseline
      const target = cfg.targetRmssdMs * 0.72 + clamp(rawRmssd, 6, 95) * 0.28;
      rmssdMs = rmssdMs * 0.75 + target * 0.25;
    }
  }

  function snapshot() {
    return {
      profileId: activeProfile,
      bpmDelta,
      baselineMicro,
      rAmpScale,
      tAmpScale,
      rShift,
      rmssdMs,
      bandSpreadBpm,
    };
  }

  return {
    setProfile(profileId) {
      if (!HRV_PROFILES[profileId]) return snapshot();
      activeProfile = profileId;
      cfg = HRV_PROFILES[profileId];
      // Nudge RMSSD smoothly toward the new autonomic regime rather than snapping mechanically
      rmssdMs = rmssdMs * 0.45 + cfg.targetRmssdMs * 0.55;
      return snapshot();
    },

    /**
     * Advances the stochastic HRV processes by dt seconds (typically 1/60s).
     */
    step(dt, { baseBpm = 118, beatWrapped = false, audioStressBoost = 0 } = {}) {
      const safeDt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0.001, 0.1);
      const sqrtDt = Math.sqrt(safeDt);
      const stressScale = 1 + clamp(audioStressBoost, 0, 1) * 0.55;

      // 1. Non-rhythmic Ornstein-Uhlenbeck cadence micro-fluctuation (BPM)
      bpmDelta += -cfg.thetaBpm * bpmDelta * safeDt + cfg.sigmaBpm * stressScale * sqrtDt * nextGaussian();
      bpmDelta = clamp(bpmDelta, -cfg.maxBpmDelta, cfg.maxBpmDelta);

      // 2. Non-periodic baseline micro-fluctuation + occasional erratic sympathetic micro-bursts
      if (rand() < cfg.burstChance * stressScale) {
        burstEnergy = clamp(burstEnergy + (rand() > 0.5 ? 1 : -1) * cfg.burstScale, -cfg.maxMicro, cfg.maxMicro);
      }
      burstEnergy *= Math.exp(-safeDt * 18);

      baselineMicro +=
        -cfg.thetaMicro * baselineMicro * safeDt +
        cfg.sigmaMicro * stressScale * sqrtDt * nextGaussian() +
        burstEnergy * 0.35;
      baselineMicro = clamp(baselineMicro, -cfg.maxMicro, cfg.maxMicro);

      // 3. Refresh per-beat stochastic R-peak / T-wave amplitude & timing jitter on cycle wrap
      if (beatWrapped) {
        drawBeatMorphology(baseBpm);
      } else {
        // Gentle continuous organic drift in RMSSD so the readout breathes subtly
        const driftTarget = cfg.targetRmssdMs + bpmDelta * 0.45;
        rmssdMs += (driftTarget - rmssdMs) * Math.min(1, safeDt * 0.9);
      }

      // 4. Smooth instantaneous HRV dispersion envelope radius (in BPM) for the D3 HRV band layer
      const targetBand = clamp(
        cfg.bandFloorBpm + Math.abs(bpmDelta) * 0.85 + Math.abs(burstEnergy) * 28 + audioStressBoost * 3.2,
        2.4,
        14
      );
      bandSpreadBpm += (targetBand - bandSpreadBpm) * Math.min(1, safeDt * 5.2);

      return snapshot();
    },

    getState() {
      return snapshot();
    },
  };
}
