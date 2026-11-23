/**
 * Physiological, speaker-audible "boom-boom" (S1 / S2) Web Audio synthesizer
 * synchronized to the 3D cardiac cycle, with a scripted short-second impact
 * boost, soft-clip warmth + brickwall limiting, smooth fade-out, and cleanup.
 */
export function createHeartbeatAudio({ onStateChange, onBoostChange } = {}) {
  const AudioCtx =
    typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  if (!AudioCtx) {
    return {
      isSupported: false,
      isMuted: () => true,
      isSuspended: () => false,
      isBoosted: () => false,
      unlock: async () => false,
      toggleMute: async () => true,
      triggerBoost: () => {},
      playBoomBoom: () => {},
      syncPhase: () => {},
      fadeOut: () => {},
      dispose: () => {},
    };
  }

  let ctx = null;
  let masterGain = null;
  let warmthFilter = null;
  let shaper = null;
  let limiter = null;
  let noiseBuffer = null;

  let muted = false;
  let fading = false;
  let disposed = false;
  let boosted = false;
  let boostTimer = null;
  let lastPhase = null;

  const BASE_GAIN = 0.76;
  const BOOST_GAIN = 1.32;
  const BASE_FILTER_HZ = 360;
  const BOOST_FILTER_HZ = 560;

  function makeWarmthCurve(drive = 1.85) {
    const samples = 1024;
    const curve = new Float32Array(samples);
    const norm = Math.tanh(drive);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(x * drive) / norm;
    }
    return curve;
  }

  function ensureGraph() {
    if (ctx || disposed) return Boolean(ctx);
    try {
      ctx = new AudioCtx();
    } catch {
      return false;
    }

    // Warm lowpass preserves chesty sub-bass AND speaker-audible 100-350 Hz punch
    warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.value = BASE_FILTER_HZ;
    warmthFilter.Q.value = 0.75;

    // Subtle analog-style soft saturation adds rich harmonics on laptop/mobile speakers
    shaper = ctx.createWaveShaper();
    shaper.curve = makeWarmthCurve(1.85);
    shaper.oversample = '2x';

    // Master gain controlled by normal presence, short 1s impact boost, and dissolve fade
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : BASE_GAIN;

    // Protective brickwall-style compressor keeps the boosted second punchy without clipping
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 10;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.14;

    warmthFilter.connect(shaper);
    shaper.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);

    // Pre-generate smoothed low-frequency noise for organic chest-wall thud
    const sampleRate = ctx.sampleRate || 44100;
    const len = Math.floor(sampleRate * 0.28);
    noiseBuffer = ctx.createBuffer(1, len, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < len; i++) {
      smooth = smooth * 0.84 + (Math.random() * 2 - 1) * 0.16;
      data[i] = smooth * 2.6;
    }

    ctx.addEventListener?.('statechange', notify);
    return true;
  }

  function notify() {
    if (disposed) return;
    onStateChange?.({
      muted,
      suspended: ctx ? ctx.state === 'suspended' : false,
      boosted,
    });
  }

  function triggerThump({
    subStart,
    subEnd,
    punchStart,
    punchEnd,
    duration,
    level,
    bodyFreq,
    delay = 0,
  }) {
    if (disposed || muted || !ctx || ctx.state !== 'running' || !warmthFilter) return;

    const now = ctx.currentTime + delay;

    // 1. Deep sub-bass chest thump (felt on headphones / subwoofers)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(subStart, now);
    subOsc.frequency.exponentialRampToValueAtTime(subEnd, now + duration);

    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(level, now + 0.011);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    subOsc.connect(subGain);
    subGain.connect(warmthFilter);
    subOsc.start(now);
    subOsc.stop(now + duration + 0.03);

    // 2. Speaker-audible mid-bass "boom" punch (clearly heard on laptop/phone speakers)
    const punchOsc = ctx.createOscillator();
    const punchGain = ctx.createGain();
    punchOsc.type = 'triangle';
    punchOsc.frequency.setValueAtTime(punchStart, now);
    punchOsc.frequency.exponentialRampToValueAtTime(punchEnd, now + duration * 0.72);

    punchGain.gain.setValueAtTime(0.0001, now);
    punchGain.gain.linearRampToValueAtTime(level * 0.56, now + 0.008);
    punchGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.74);

    punchOsc.connect(punchGain);
    punchGain.connect(warmthFilter);
    punchOsc.start(now);
    punchOsc.stop(now + duration + 0.02);

    // 3. Organic membrane/chest-cavity transient knock
    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(bodyFreq, now);
      bp.Q.value = 1.05;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(level * 0.45, now + 0.012);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.68);

      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(warmthFilter);
      noise.start(now);
      noise.stop(now + duration + 0.02);
    }
  }

  function playLub(delay = 0) {
    // S1 ("BOOM"): deep, commanding ventricular systole thump
    triggerThump({
      subStart: 82,
      subEnd: 35,
      punchStart: 158,
      punchEnd: 70,
      duration: 0.22,
      level: 0.96,
      bodyFreq: 138,
      delay,
    });
  }

  function playDub(delay = 0) {
    // S2 ("boom"): tight, resonant valve-closure echo
    triggerThump({
      subStart: 96,
      subEnd: 43,
      punchStart: 186,
      punchEnd: 86,
      duration: 0.16,
      level: 0.74,
      bodyFreq: 178,
      delay,
    });
  }

  /**
   * Short-second scripted audio swell: increases output punch and opens warmth
   * filter for ~1.15s, then smoothly settles back to baseline (or fade-out).
   */
  function triggerBoost(durationSeconds = 1.15) {
    if (disposed || fading || muted) return;
    if (!ctx || !masterGain || !warmthFilter) return;

    const now = ctx.currentTime;
    const hold = Math.max(0.45, durationSeconds);
    const attack = 0.09;
    const release = 0.34;

    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.001, masterGain.gain.value), now);
    masterGain.gain.linearRampToValueAtTime(BOOST_GAIN, now + attack);
    masterGain.gain.setValueAtTime(BOOST_GAIN, now + Math.max(attack, hold - release));
    masterGain.gain.linearRampToValueAtTime(BASE_GAIN, now + hold);

    warmthFilter.frequency.cancelScheduledValues(now);
    warmthFilter.frequency.setValueAtTime(warmthFilter.frequency.value, now);
    warmthFilter.frequency.linearRampToValueAtTime(BOOST_FILTER_HZ, now + attack);
    warmthFilter.frequency.setValueAtTime(BOOST_FILTER_HZ, now + Math.max(attack, hold - release));
    warmthFilter.frequency.linearRampToValueAtTime(BASE_FILTER_HZ, now + hold);

    boosted = true;
    onBoostChange?.(true);
    notify();

    if (boostTimer !== null) {
      clearTimeout(boostTimer);
    }
    boostTimer = window.setTimeout(() => {
      boostTimer = null;
      boosted = false;
      onBoostChange?.(false);
      notify();
    }, Math.round(hold * 1000));
  }

  /**
   * Immediately fires a single unmistakable "boom-boom" pair (S1 + S2).
   * Useful on first gesture unlock or direct pulse trigger.
   */
  function playBoomBoom({ boost = true } = {}) {
    if (disposed || muted || !ctx || ctx.state !== 'running') return;
    if (boost && !fading) {
      triggerBoost(1.1);
    }
    playLub(0);
    playDub(0.24);
  }

  function crossed(prev, curr, target) {
    if (prev <= curr) {
      return prev < target && curr >= target;
    }
    return prev < target || curr >= target;
  }

  async function unlock() {
    if (disposed) return false;
    if (!ensureGraph()) return false;
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      notify();
      return ctx.state === 'running';
    } catch {
      notify();
      return false;
    }
  }

  async function toggleMute() {
    if (disposed) return muted;
    if (!ctx) ensureGraph();

    if (ctx && ctx.state === 'suspended') {
      muted = false;
      const running = await unlock();
      if (running && !fading) {
        playBoomBoom({ boost: true });
      }
    } else {
      muted = !muted;
    }

    if (masterGain && ctx && !fading) {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(
        muted ? 0 : boosted ? BOOST_GAIN : BASE_GAIN,
        now + 0.06
      );
    }
    notify();
    return muted;
  }

  function syncPhase(phase) {
    if (disposed) return;
    const p = phase - Math.floor(phase);
    if (lastPhase === null) {
      lastPhase = p;
      return;
    }
    // S1 ("BOOM") at ventricular contraction onset (0.17); S2 ("boom") at relaxation onset (0.48)
    if (crossed(lastPhase, p, 0.17)) {
      playLub();
    }
    if (crossed(lastPhase, p, 0.48)) {
      playDub();
    }
    lastPhase = p;
  }

  function fadeOut(durationSeconds = 0.9) {
    if (disposed || fading) return;
    fading = true;
    boosted = false;
    if (boostTimer !== null) {
      clearTimeout(boostTimer);
      boostTimer = null;
    }
    onBoostChange?.(false);
    if (!ctx || !masterGain) return;

    const now = ctx.currentTime;
    const dur = Math.max(0.12, durationSeconds);
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    masterGain.gain.linearRampToValueAtTime(0, now + dur + 0.02);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (boostTimer !== null) {
      clearTimeout(boostTimer);
      boostTimer = null;
    }
    if (ctx) {
      ctx.removeEventListener?.('statechange', notify);
      try {
        ctx.close();
      } catch {
        // Ignore close errors if context was never started
      }
      ctx = null;
    }
    masterGain = null;
    warmthFilter = null;
    shaper = null;
    limiter = null;
    noiseBuffer = null;
  }

  // Attempt eager creation so Replay (user gesture) or permissive browsers start running immediately
  ensureGraph();
  if (ctx?.state === 'suspended') {
    ctx.resume().then(notify).catch(notify);
  }

  return {
    isSupported: true,
    isMuted: () => muted,
    isSuspended: () => (ctx ? ctx.state === 'suspended' : false),
    isBoosted: () => boosted,
    unlock,
    toggleMute,
    triggerBoost,
    playBoomBoom,
    syncPhase,
    fadeOut,
    dispose,
  };
}
