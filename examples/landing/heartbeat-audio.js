/**
 * Low-latency, speaker-audible "boom-boom" (S1 / S2) Web Audio synthesizer
 * synchronized to the 3D cardiac cycle and D3 rhythm scope.
 *
 * Engineered for zero post-beat aftermath:
 * - Interactive-latency AudioContext scheduling
 * - Zero-oversample soft saturation (no FIR filter ring/delay)
 * - Exact linear ramp-to-zero before oscillator stop + immediate onended node disconnect
 * - Sample-accurate hardware-clocked S1/S2 ("lub-dub") pairs and synchronous first-beat fire
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
      getLatencyMs: () => 0,
      unlock: async () => false,
      toggleMute: async () => true,
      setStressIntensity: () => {},
      triggerBoost: () => {},
      playBoomBoom: () => {},
      playBoomSequence: async () => {},
      stopSequence: () => {},
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
  let stressIntensity = 0.25;
  let boostTimer = null;
  let sequenceTimers = [];
  let lastPhase = null;
  let lastTriggerLatencyMs = 0.4;

  const BASE_GAIN = 0.76;
  const BOOST_GAIN = 1.32;
  const BASE_FILTER_HZ = 350;
  const BOOST_FILTER_HZ = 560;

  function makeWarmthCurve(drive = 1.8) {
    const samples = 512;
    const curve = new Float32Array(samples);
    const norm = Math.tanh(drive);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(x * drive) / norm;
    }
    return curve;
  }

  function effectiveBaseGain() {
    return BASE_GAIN + stressIntensity * 0.22;
  }

  function effectiveFilterHz() {
    return BASE_FILTER_HZ + stressIntensity * 145;
  }

  function ensureGraph() {
    if (ctx || disposed) return Boolean(ctx);
    try {
      ctx = new AudioCtx({ latencyHint: 'interactive' });
    } catch {
      try {
        ctx = new AudioCtx();
      } catch {
        return false;
      }
    }

    // Warm lowpass preserves chesty sub-bass AND speaker-audible 100-480 Hz punch
    warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.value = effectiveFilterHz();
    warmthFilter.Q.value = 0.72;

    // Zero-oversample soft saturation adds harmonics without FIR phase delay or post-beat ringing
    shaper = ctx.createWaveShaper();
    shaper.curve = makeWarmthCurve(1.8);
    shaper.oversample = 'none';

    // Master gain controlled by baseline, stress intensity, short 1s impact boost, and dissolve fade
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : effectiveBaseGain();

    // Fast, transparent peak limiter with short release so there is zero compressor pumping tail
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4.5;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.055;

    warmthFilter.connect(shaper);
    shaper.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);

    // Pre-generate smoothed low-frequency noise with a tapered tail so the buffer ends at 0.0
    const sampleRate = ctx.sampleRate || 44100;
    const len = Math.floor(sampleRate * 0.22);
    noiseBuffer = ctx.createBuffer(1, len, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      smooth = smooth * 0.84 + (Math.random() * 2 - 1) * 0.16;
      data[i] = smooth * 2.55 * env;
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

  function stopSequence() {
    for (const id of sequenceTimers) {
      clearTimeout(id);
    }
    sequenceTimers = [];
  }

  function setStressIntensity(level = 0.25) {
    stressIntensity = Math.max(0, Math.min(1, Number(level) || 0));
    if (disposed || fading || boosted || !ctx || !masterGain || !warmthFilter) return;
    const now = ctx.currentTime;
    if (!muted) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(effectiveBaseGain(), now + 0.08);
    }
    warmthFilter.frequency.cancelScheduledValues(now);
    warmthFilter.frequency.setValueAtTime(warmthFilter.frequency.value, now);
    warmthFilter.frequency.linearRampToValueAtTime(effectiveFilterHz(), now + 0.08);
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
    if (disposed || fading || muted || !ctx || ctx.state !== 'running' || !warmthFilter) return;

    const t0 = performance.now();
    const now = ctx.currentTime + Math.max(0, delay);
    const tailZero = now + duration;
    const stopAt = tailZero + 0.008;

    // 1. Deep sub-bass chest thump (ramped cleanly to true 0.0 + disconnected on end)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(subStart, now);
    subOsc.frequency.exponentialRampToValueAtTime(subEnd, now + duration * 0.92);

    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(level, now + 0.009);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.88);
    subGain.gain.linearRampToValueAtTime(0, tailZero);

    subOsc.connect(subGain);
    subGain.connect(warmthFilter);
    subOsc.onended = () => {
      subOsc.disconnect();
      subGain.disconnect();
    };
    subOsc.start(now);
    subOsc.stop(stopAt);

    // 2. Speaker-audible mid-bass "boom" punch
    const punchDur = duration * 0.74;
    const punchZero = now + punchDur;
    const punchOsc = ctx.createOscillator();
    const punchGain = ctx.createGain();
    punchOsc.type = 'triangle';
    punchOsc.frequency.setValueAtTime(punchStart, now);
    punchOsc.frequency.exponentialRampToValueAtTime(punchEnd, now + punchDur * 0.92);

    punchGain.gain.setValueAtTime(0.0001, now);
    punchGain.gain.linearRampToValueAtTime(level * 0.58, now + 0.007);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + punchDur * 0.86);
    punchGain.gain.linearRampToValueAtTime(0, punchZero);

    punchOsc.connect(punchGain);
    punchGain.connect(warmthFilter);
    punchOsc.onended = () => {
      punchOsc.disconnect();
      punchGain.disconnect();
    };
    punchOsc.start(now);
    punchOsc.stop(punchZero + 0.006);

    // 3. Organic membrane/chest-cavity transient knock
    if (noiseBuffer) {
      const noiseDur = duration * 0.68;
      const noiseZero = now + noiseDur;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(bodyFreq, now);
      bp.Q.value = 1.0;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(level * 0.45, now + 0.009);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur * 0.85);
      nGain.gain.linearRampToValueAtTime(0, noiseZero);

      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(warmthFilter);
      noise.onended = () => {
        noise.disconnect();
        bp.disconnect();
        nGain.disconnect();
      };
      noise.start(now);
      noise.stop(noiseZero + 0.006);
    }

    const baseLatencyMs = (ctx.baseLatency || 0) * 1000;
    lastTriggerLatencyMs = Math.max(0.2, Math.min(9.9, performance.now() - t0 + baseLatencyMs));
  }

  function playLub(delay = 0, gainScale = 1) {
    // S1 ("BOOM"): deep, commanding ventricular systole thump
    const lift = 1 + stressIntensity * 0.14;
    triggerThump({
      subStart: 82 * lift,
      subEnd: 36,
      punchStart: 158 * lift,
      punchEnd: 70,
      duration: 0.2 - stressIntensity * 0.025,
      level: Math.min(1.15, 0.95 * gainScale),
      bodyFreq: 138 + stressIntensity * 28,
      delay,
    });
  }

  function playDub(delay = 0, gainScale = 1) {
    // S2 ("boom"): tight, resonant valve-closure echo
    const lift = 1 + stressIntensity * 0.12;
    triggerThump({
      subStart: 96 * lift,
      subEnd: 44,
      punchStart: 186 * lift,
      punchEnd: 86,
      duration: 0.15 - stressIntensity * 0.018,
      level: Math.min(0.98, 0.72 * gainScale),
      bodyFreq: 178 + stressIntensity * 32,
      delay,
    });
  }

  /**
   * Short-second scripted audio swell: increases output punch and opens warmth
   * filter for ~0.95s, then smoothly settles back to baseline with zero tail.
   */
  function triggerBoost(durationSeconds = 0.95) {
    if (disposed || fading || muted) return;
    if (!ctx || !masterGain || !warmthFilter) return;

    const now = ctx.currentTime;
    const hold = Math.max(0.38, durationSeconds);
    const attack = 0.045;
    const release = 0.24;

    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.001, masterGain.gain.value), now);
    masterGain.gain.linearRampToValueAtTime(BOOST_GAIN, now + attack);
    masterGain.gain.setValueAtTime(BOOST_GAIN, now + Math.max(attack, hold - release));
    masterGain.gain.linearRampToValueAtTime(effectiveBaseGain(), now + hold);

    warmthFilter.frequency.cancelScheduledValues(now);
    warmthFilter.frequency.setValueAtTime(warmthFilter.frequency.value, now);
    warmthFilter.frequency.linearRampToValueAtTime(BOOST_FILTER_HZ, now + attack);
    warmthFilter.frequency.setValueAtTime(BOOST_FILTER_HZ, now + Math.max(attack, hold - release));
    warmthFilter.frequency.linearRampToValueAtTime(effectiveFilterHz(), now + hold);

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
   * Immediately fires a single unmistakable "boom-boom" pair (S1 + S2)
   * with hardware-clocked S2 timing and optional visual beat callback.
   */
  function playBoomBoom({ boost = true, bpm = 108, onBeat = null } = {}) {
    if (disposed) return;
    fading = false;
    muted = false;
    ensureGraph();

    const dubDelaySec = Math.max(0.14, Math.min(0.24, (60 / Math.max(48, Math.min(165, bpm))) * 0.29));

    const fireNow = () => {
      if (disposed || muted || !ctx || ctx.state !== 'running') return;
      if (boost && !fading) {
        triggerBoost(0.85);
      }
      playLub(0, 1.06);
      playDub(dubDelaySec, 1.04);
      onBeat?.(0, 'lub');
      const tDub = window.setTimeout(() => {
        if (!disposed && !muted && !fading) {
          onBeat?.(0, 'dub');
        }
      }, Math.round(dubDelaySec * 1000));
      sequenceTimers.push(tDub);
    };

    if (ctx && ctx.state === 'running') {
      fireNow();
    } else {
      unlock().then((ok) => {
        if (ok) fireNow();
      });
    }
  }

  /**
   * Plays a commanding multi-beat "boom-boom, boom-boom, boom-boom" sequence
   * with synchronous first-beat execution and sample-accurate S1/S2 audio scheduling.
   */
  async function playBoomSequence({
    beats = 3,
    bpm = 112,
    intensity = 0.85,
    boost = true,
    onBeat = null,
    onDone = null,
  } = {}) {
    if (disposed) return;
    stopSequence();
    fading = false;
    muted = false;
    ensureGraph();
    setStressIntensity(intensity);

    if (!ctx) {
      onDone?.();
      return;
    }

    if (ctx.state !== 'running') {
      const unlocked = await unlock();
      if (!unlocked || disposed) {
        onDone?.();
        return;
      }
    }

    const cycleMs = Math.max(360, Math.round(60000 / Math.max(45, Math.min(165, bpm))));
    const dubOffsetMs = Math.round(cycleMs * 0.29);
    const dubOffsetSec = dubOffsetMs / 1000;
    const totalMs = (beats - 1) * cycleMs + dubOffsetMs + 220;

    if (boost) {
      triggerBoost(Math.min(2.2, totalMs / 1000));
    }

    const scheduleBeatPair = (index) => {
      if (disposed || muted || fading) return;
      const accent = index === beats - 1 ? 1.1 : 1.0;
      // Schedule both S1 and S2 on the Web Audio hardware clock so the lub-dub interval never jitters
      playLub(0, accent);
      playDub(dubOffsetSec, accent);
      onBeat?.(index, 'lub');

      const tDubUi = window.setTimeout(() => {
        if (!disposed && !muted && !fading) {
          onBeat?.(index, 'dub');
        }
      }, dubOffsetMs);
      sequenceTimers.push(tDubUi);
    };

    // Beat 0 fires synchronously on the same frame as the user click (zero timer latency)
    scheduleBeatPair(0);

    for (let i = 1; i < beats; i++) {
      const startMs = i * cycleMs;
      const tBeat = window.setTimeout(() => scheduleBeatPair(i), startMs);
      sequenceTimers.push(tBeat);
    }

    const tEnd = window.setTimeout(() => {
      sequenceTimers = [];
      onDone?.();
    }, totalMs);
    sequenceTimers.push(tEnd);
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
      if (masterGain && ctx && !fading && !muted) {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(
          Math.max(0.001, boosted ? BOOST_GAIN : effectiveBaseGain()),
          now
        );
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
        muted ? 0 : boosted ? BOOST_GAIN : effectiveBaseGain(),
        now + 0.04
      );
    }
    notify();
    return muted;
  }

  function syncPhase(phase) {
    if (disposed || fading) return;
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

  function fadeOut(durationSeconds = 0.35) {
    if (disposed || fading) return;
    fading = true;
    boosted = false;
    stopSequence();
    if (boostTimer !== null) {
      clearTimeout(boostTimer);
      boostTimer = null;
    }
    onBoostChange?.(false);
    if (!ctx || !masterGain) return;

    const now = ctx.currentTime;
    const dur = Math.max(0.08, durationSeconds);
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.85);
    masterGain.gain.linearRampToValueAtTime(0, now + dur);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    fading = true;
    stopSequence();
    if (boostTimer !== null) {
      clearTimeout(boostTimer);
      boostTimer = null;
    }
    if (ctx) {
      ctx.removeEventListener?.('statechange', notify);
      try {
        if (masterGain) {
          masterGain.gain.setValueAtTime(0, ctx.currentTime);
        }
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
    getLatencyMs: () => lastTriggerLatencyMs,
    unlock,
    toggleMute,
    setStressIntensity,
    triggerBoost,
    playBoomBoom,
    playBoomSequence,
    stopSequence,
    syncPhase,
    fadeOut,
    dispose,
  };
}
