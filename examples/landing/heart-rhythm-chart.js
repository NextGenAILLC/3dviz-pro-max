import * as d3 from 'd3';
import {
  DEFAULT_CRITICAL_BPM,
  TRAILING_WINDOW_SECONDS,
  createTrailingAverageTracker,
} from './heart-trend-tracker.js';
import { createStochasticHrvEngine } from './heart-hrv-engine.js';

const BUFFER_SIZE = 180;
const SAMPLE_RATE_HZ = 60;
const BPM_DOMAIN = [40, 165];
const AVG_COLOR_DEFAULT = '#f4d37a';
const AVG_COLOR_CRITICAL = '#ff8a96';
const HRV_BAND_COLOR = '#89c4f4';
const HRV_STRESS_COLOR = '#e890a4';

const PROFILE_SHAPES = {
  baseline: {
    bpm: 62,
    color: '#92d6bd',
    rAmp: 0.82,
    rWidth: 0.019,
    qDepth: 0.14,
    sDepth: 0.22,
    tAmp: 0.26,
    audioBoostGain: 0.2,
    audioSharpen: 0.88,
    transientSpikeBpm: 18,
  },
  stress: {
    bpm: 96,
    color: '#e2a568',
    rAmp: 1.04,
    rWidth: 0.012,
    qDepth: 0.22,
    sDepth: 0.32,
    tAmp: 0.3,
    audioBoostGain: 0.36,
    audioSharpen: 0.72,
    transientSpikeBpm: 22,
  },
  'sleep-debt': {
    bpm: 118,
    color: '#e46b7b',
    rAmp: 1.2,
    rWidth: 0.0085,
    qDepth: 0.28,
    sDepth: 0.4,
    tAmp: 0.34,
    audioBoostGain: 0.48,
    audioSharpen: 0.62,
    transientSpikeBpm: 24,
  },
  tactical: {
    bpm: 142,
    color: '#ff6f80',
    rAmp: 1.26,
    rWidth: 0.008,
    qDepth: 0.3,
    sDepth: 0.42,
    tAmp: 0.36,
    audioBoostGain: 0.52,
    audioSharpen: 0.6,
    transientSpikeBpm: 16,
  },
};

/**
 * Evaluates a synthetic P-QRS-T heartbeat sample at normalized cycle phase u in [0, 1),
 * organically modulated by the stochastic HRV layer (per-beat R/T amplitude variance,
 * slight timing micro-shift, and non-rhythmic Ornstein-Uhlenbeck baseline fluctuations).
 */
function sampleHeartbeat(u, shape, spikeBoost = 0, beatRipple = 0, hrv = null) {
  const x = u - Math.floor(u);
  const clampedBoost = Math.max(0, Math.min(1, spikeBoost));
  const sharpen = 1 - (1 - shape.audioSharpen) * clampedBoost;
  const rAmpScale = hrv ? hrv.rAmpScale : 1;
  const tAmpScale = hrv ? hrv.tAmpScale : 1;
  const shift = hrv ? hrv.rShift : 0;
  const micro = hrv ? hrv.baselineMicro : 0;

  const rW = shape.rWidth * sharpen;
  const rH = (shape.rAmp + clampedBoost * shape.audioBoostGain) * rAmpScale;

  const p = 0.13 * Math.exp(-Math.pow((x - (0.14 + shift * 0.5)) / 0.036, 2));
  const q = -(shape.qDepth + spikeBoost * 0.1) * Math.exp(-Math.pow((x - (0.255 + shift)) / (0.013 * sharpen), 2));
  const r = rH * Math.exp(-Math.pow((x - (0.29 + shift)) / rW, 2));
  const s = -(shape.sDepth + spikeBoost * 0.12) * Math.exp(-Math.pow((x - (0.325 + shift)) / (0.014 * sharpen), 2));
  const t = (shape.tAmp * tAmpScale + beatRipple * 0.14) * Math.exp(-Math.pow((x - (0.54 + shift * 0.7)) / 0.052, 2));

  return p + q + r + s + t + micro;
}

/**
 * Mounts a D3.js real-time SVG heartbeat rhythm chart inside a host container.
 * Combines:
 *  - Instantaneous P-QRS-T cardiac waveform (left amplitude axis)
 *  - Stochastic Heart Rate Variability (HRV) micro-fluctuation & dispersion layer
 *  - Exact 30-second trailing average heart rate line (right BPM axis)
 */
export function mountHeartRhythmChart({
  container,
  initialProfile = 'sleep-debt',
  isPaused = () => false,
  onTrendUpdate = null,
} = {}) {
  if (!container) {
    return {
      setProfile: () => {},
      triggerBeat: () => {},
      getTrendState: () => null,
      destroy: () => {},
    };
  }

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeProfile = PROFILE_SHAPES[initialProfile] ? initialProfile : 'sleep-debt';
  let shape = PROFILE_SHAPES[activeProfile];
  let disposed = false;
  let isOffscreen = false;
  let rafId = null;
  let lastTs = 0;
  let lastTrendEmitTs = 0;
  let accumulator = 0;
  let cyclePhase = 0;

  // Audio-synced spike state (driven directly by boom-boom S1/S2 audio hits)
  let activeAudioBoost = 0;
  let dubEchoBoost = 0;
  let transientSurgeBpm = 0;
  let headGlow = 0;
  let liveSpikeQueue = [];

  // Exact 30-second trailing average BPM tracker (1800 samples at 60 Hz)
  const trendTracker = createTrailingAverageTracker({
    windowSeconds: TRAILING_WINDOW_SECONDS,
    sampleRateHz: SAMPLE_RATE_HZ,
    initialBpm: shape.bpm,
    criticalThreshold: DEFAULT_CRITICAL_BPM,
  });

  // Non-rhythmic Ornstein-Uhlenbeck stochastic HRV engine
  const hrvEngine = createStochasticHrvEngine({
    initialProfile: activeProfile,
  });

  // Rolling real-time visible buffers (3 seconds @ 60 Hz)
  const samples = new Array(BUFFER_SIZE).fill(0);
  const peakFlags = new Array(BUFFER_SIZE).fill(false);
  const avgSamples = new Array(BUFFER_SIZE).fill(shape.bpm);
  const instantBpmSamples = new Array(BUFFER_SIZE).fill(shape.bpm);
  const hrvBandSamples = Array.from({ length: BUFFER_SIZE }, () => ({
    low: shape.bpm - 4,
    high: shape.bpm + 4,
  }));
  const hrvMicroSamples = new Array(BUFFER_SIZE).fill(0);
  const hrvRmssdSamples = new Array(BUFFER_SIZE).fill(hrvEngine.getState().rmssdMs);

  let hoverIndex = null;

  function buildCombinedTrendState() {
    const trend = trendTracker.getState();
    const hrv = hrvEngine.getState();
    return {
      ...trend,
      rmssdMs: hrv.rmssdMs,
      hrvSpreadBpm: hrv.bandSpreadBpm,
    };
  }

  function emitTrend(force = false, ts = performance.now()) {
    if (typeof onTrendUpdate !== 'function') return;
    if (!force && ts - lastTrendEmitTs < 180) return;
    lastTrendEmitTs = ts;
    onTrendUpdate(buildCombinedTrendState());
  }

  function seedBuffer(withAudioSpike = false, { resetTracker = false } = {}) {
    if (resetTracker) {
      trendTracker.reset(shape.bpm);
    }
    const cyclesVisible = 1.85 + (shape.bpm - 60) / 72;
    let prevBeatIdx = -1;
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const frac = i / (BUFFER_SIZE - 1);
      const u = frac * cyclesVisible;
      const beatIdx = Math.floor(u);
      const beatWrapped = beatIdx !== prevBeatIdx;
      prevBeatIdx = beatIdx;

      const boost = withAudioSpike && frac > 0.55 ? 0.95 : 0;
      const hrv = hrvEngine.step(1 / SAMPLE_RATE_HZ, {
        baseBpm: shape.bpm,
        beatWrapped,
        audioStressBoost: boost,
      });

      const spikeOffset = boost > 0.5 ? shape.transientSpikeBpm * (1 - (frac - 0.55) * 1.4) : 0;
      const instant = Math.max(42, Math.min(164, shape.bpm + hrv.bpmDelta + spikeOffset));
      const state = resetTracker ? trendTracker.getState() : trendTracker.pushSample(instant);

      samples[i] = sampleHeartbeat(u, shape, boost, 0, hrv);
      peakFlags[i] = boost > 0.5 && samples[i] > shape.rAmp * 0.92;
      instantBpmSamples[i] = instant;
      avgSamples[i] = state.trailingAvgBpm;
      hrvMicroSamples[i] = hrv.baselineMicro;
      hrvRmssdSamples[i] = hrv.rmssdMs;
      hrvBandSamples[i] = {
        low: state.trailingAvgBpm - hrv.bandSpreadBpm + hrv.bpmDelta * 0.22,
        high: state.trailingAvgBpm + hrv.bandSpreadBpm + hrv.bpmDelta * 0.22,
      };
    }
    cyclePhase = cyclesVisible % 1;
  }

  seedBuffer(false, { resetTracker: true });

  // Build D3 SVG DOM structure
  const root = d3.select(container);
  root.selectAll('*').remove();

  const margin = { top: 14, right: 40, bottom: 14, left: 34 };
  const height = 132;
  let width = Math.max(260, container.clientWidth || 440);

  const svg = root
    .append('svg')
    .attr('class', 'lens-d3-svg')
    .attr('role', 'img')
    .attr(
      'aria-label',
      'D3 real-time synthetic heartbeat rhythm waveform with stochastic HRV micro-fluctuation layer and 30-second trailing average BPM trend line'
    )
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'none');

  const defs = svg.append('defs');

  const areaGrad = defs
    .append('linearGradient')
    .attr('id', 'lens-d3-area-grad')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '0%')
    .attr('y2', '100%');

  const gradTop = areaGrad.append('stop').attr('offset', '0%').attr('stop-opacity', 0.3);
  const gradMid = areaGrad.append('stop').attr('offset', '68%').attr('stop-opacity', 0.04);
  const gradBot = areaGrad.append('stop').attr('offset', '100%').attr('stop-opacity', 0);

  const glowFilter = defs
    .append('filter')
    .attr('id', 'lens-d3-glow')
    .attr('x', '-10%')
    .attr('y', '-30%')
    .attr('width', '120%')
    .attr('height', '160%');
  glowFilter.append('feGaussianBlur').attr('stdDeviation', '2.1').attr('result', 'blur');
  const merge = glowFilter.append('feMerge');
  merge.append('feMergeNode').attr('in', 'blur');
  merge.append('feMergeNode').attr('in', 'SourceGraphic');

  const gridLayer = svg.append('g').attr('class', 'lens-d3-grid');
  const thresholdLayer = svg.append('g').attr('class', 'lens-d3-threshold-layer');
  const axisLayer = svg.append('g').attr('class', 'lens-d3-axis');
  const bpmAxisLayer = svg.append('g').attr('class', 'lens-d3-axis lens-d3-axis-bpm');

  const xScale = d3.scaleLinear().domain([0, BUFFER_SIZE - 1]).range([margin.left, width - margin.right]);
  const yScale = d3.scaleLinear().domain([-0.62, 1.82]).range([height - margin.bottom, margin.top]);
  const bpmScale = d3.scaleLinear().domain(BPM_DOMAIN).range([height - margin.bottom, margin.top]).clamp(true);

  const areaGen = d3
    .area()
    .x((_d, i) => xScale(i))
    .y0(() => yScale(0))
    .y1((d) => yScale(d))
    .curve(d3.curveMonotoneX);

  const lineGen = d3
    .line()
    .x((_d, i) => xScale(i))
    .y((d) => yScale(d))
    .curve(d3.curveMonotoneX);

  const avgLineGen = d3
    .line()
    .x((_d, i) => xScale(i))
    .y((d) => bpmScale(d))
    .curve(d3.curveMonotoneX);

  const hrvBandGen = d3
    .area()
    .x((_d, i) => xScale(i))
    .y0((d) => bpmScale(d.low))
    .y1((d) => bpmScale(d.high))
    .curve(d3.curveMonotoneX);

  const hrvMicroLineGen = d3
    .line()
    .x((_d, i) => xScale(i))
    .y((d) => yScale(d * 2.2))
    .curve(d3.curveLinear);

  const baselineLine = svg
    .append('line')
    .attr('class', 'lens-d3-baseline')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', yScale(0))
    .attr('y2', yScale(0));

  const thresholdLine = thresholdLayer
    .append('line')
    .attr('class', 'lens-d3-threshold')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', bpmScale(DEFAULT_CRITICAL_BPM))
    .attr('y2', bpmScale(DEFAULT_CRITICAL_BPM));

  // Dedicated stochastic HRV dispersion envelope + organic baseline micro-fluctuation layer
  const hrvLayer = svg.append('g').attr('class', 'lens-d3-hrv-layer');
  const hrvBandPath = hrvLayer
    .append('path')
    .attr('class', 'lens-d3-hrv-band');
  const hrvMicroPath = hrvLayer
    .append('path')
    .attr('class', 'lens-d3-hrv-micro')
    .attr('fill', 'none')
    .attr('stroke-width', 0.9);

  const areaPath = svg
    .append('path')
    .attr('class', 'lens-d3-area')
    .attr('fill', 'url(#lens-d3-area-grad)');

  const tracePath = svg
    .append('path')
    .attr('class', 'lens-d3-trace')
    .attr('fill', 'none')
    .attr('stroke-width', 1.85)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round');

  const spikeMarkersLayer = svg.append('g').attr('class', 'lens-d3-spikes');

  // 30-second trailing average BPM trend line (dark halo casing + crisp dashed line + right-edge dot)
  const avgHaloPath = svg
    .append('path')
    .attr('class', 'lens-d3-avg-halo')
    .attr('fill', 'none')
    .attr('stroke-width', 3.6)
    .attr('stroke-linecap', 'round');

  const avgPath = svg
    .append('path')
    .attr('class', 'lens-d3-avg-line')
    .attr('fill', 'none')
    .attr('stroke-width', 1.8)
    .attr('stroke-dasharray', '5 3')
    .attr('stroke-linecap', 'round');

  const avgHeadDot = svg
    .append('circle')
    .attr('class', 'lens-d3-avg-dot')
    .attr('r', 3);

  const headRing = svg
    .append('circle')
    .attr('class', 'lens-d3-ring')
    .attr('r', 4)
    .attr('fill', 'none')
    .attr('stroke-width', 1.25)
    .attr('opacity', 0);

  const headDot = svg
    .append('circle')
    .attr('class', 'lens-d3-head')
    .attr('r', 2.6);

  // Interactive hover crosshair probe for inspecting live BPM, 30s trailing average, and HRV RMSSD
  const hoverLayer = svg.append('g').attr('class', 'lens-d3-hover').style('display', 'none');
  const hoverLine = hoverLayer
    .append('line')
    .attr('class', 'lens-d3-hover-line')
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom);
  const hoverAvgDot = hoverLayer.append('circle').attr('class', 'lens-d3-hover-avg-dot').attr('r', 3.2);
  const hoverLabelBg = hoverLayer
    .append('rect')
    .attr('class', 'lens-d3-hover-bg')
    .attr('rx', 1)
    .attr('height', 16);
  const hoverLabelText = hoverLayer
    .append('text')
    .attr('class', 'lens-d3-hover-text')
    .attr('y', margin.top + 11);

  const interactionOverlay = svg
    .append('rect')
    .attr('class', 'lens-d3-overlay')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', Math.max(10, width - margin.left - margin.right))
    .attr('height', height - margin.top - margin.bottom)
    .attr('fill', 'transparent');

  function renderHoverProbe() {
    if (hoverIndex === null) {
      hoverLayer.style('display', 'none');
      return;
    }

    const idx = Math.max(0, Math.min(BUFFER_SIZE - 1, hoverIndex));
    const cx = xScale(idx);
    const avgVal = avgSamples[idx];
    const instVal = instantBpmSamples[idx];
    const rmssdVal = hrvRmssdSamples[idx];
    const cyAvg = bpmScale(avgVal);
    const labelStr = `30S ${avgVal.toFixed(1)} · INST ${Math.round(instVal)} · HRV ${Math.round(rmssdVal)}MS`;

    hoverLayer.style('display', null);
    hoverLine.attr('x1', cx).attr('x2', cx);
    hoverAvgDot
      .attr('cx', cx)
      .attr('cy', cyAvg)
      .attr('fill', avgVal > DEFAULT_CRITICAL_BPM ? AVG_COLOR_CRITICAL : AVG_COLOR_DEFAULT);

    hoverLabelText.text(labelStr);
    const approxTextWidth = labelStr.length * 5.15 + 12;
    const minLeft = margin.left + 4;
    const maxLeft = width - margin.right - approxTextWidth - 4;
    const preferredLeft = cx + 8 > maxLeft ? cx - approxTextWidth - 8 : cx + 8;
    const boxX = Math.max(minLeft, Math.min(maxLeft, preferredLeft));

    hoverLabelBg
      .attr('x', boxX)
      .attr('y', margin.top)
      .attr('width', approxTextWidth);
    hoverLabelText.attr('x', boxX + 6).attr('y', margin.top + 11);
  }

  interactionOverlay
    .on('pointermove', (event) => {
      const [px] = d3.pointer(event, svg.node());
      const rawIdx = Math.round(xScale.invert(px));
      hoverIndex = Math.max(0, Math.min(BUFFER_SIZE - 1, rawIdx));
      renderHoverProbe();
    })
    .on('pointerleave', () => {
      hoverIndex = null;
      renderHoverProbe();
    });

  function renderGrid() {
    const innerW = width - margin.right;
    const vTicks = d3.range(margin.left, innerW + 1, 36);
    const hValues = [-0.4, 0, 0.5, 1.0, 1.5];

    gridLayer
      .selectAll('line.grid-v')
      .data(vTicks)
      .join('line')
      .attr('class', 'grid-v')
      .attr('x1', (d) => d)
      .attr('x2', (d) => d)
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom);

    gridLayer
      .selectAll('line.grid-h')
      .data(hValues)
      .join('line')
      .attr('class', 'grid-h')
      .attr('x1', margin.left)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d));

    axisLayer
      .selectAll('text.axis-tick')
      .data([
        { y: 1.5, text: '+1.5' },
        { y: 1.0, text: '+1.0' },
        { y: 0, text: '0.0' },
        { y: -0.4, text: '-0.4' },
      ])
      .join('text')
      .attr('class', 'axis-tick')
      .attr('x', margin.left - 6)
      .attr('y', (d) => yScale(d.y) + 3)
      .attr('text-anchor', 'end')
      .text((d) => d.text);

    bpmAxisLayer
      .selectAll('text.axis-tick-bpm')
      .data([
        { bpm: 140, text: '140', critical: true },
        { bpm: 100, text: '100', critical: false },
        { bpm: 60, text: '60', critical: false },
      ])
      .join('text')
      .attr('class', (d) => (d.critical ? 'axis-tick-bpm is-critical-tick' : 'axis-tick-bpm'))
      .attr('x', innerW + 6)
      .attr('y', (d) => bpmScale(d.bpm) + 3)
      .attr('text-anchor', 'start')
      .text((d) => d.text);

    baselineLine
      .attr('x1', margin.left)
      .attr('x2', innerW)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0));

    thresholdLine
      .attr('x1', margin.left)
      .attr('x2', innerW)
      .attr('y1', bpmScale(DEFAULT_CRITICAL_BPM))
      .attr('y2', bpmScale(DEFAULT_CRITICAL_BPM));

    interactionOverlay
      .attr('x', margin.left)
      .attr('width', Math.max(10, innerW - margin.left));
  }

  function applyPalette() {
    const isStressed =
      activeProfile === 'stress' ||
      activeProfile === 'sleep-debt' ||
      activeProfile === 'tactical';
    const hrvTone = isStressed ? HRV_STRESS_COLOR : HRV_BAND_COLOR;

    gradTop.attr('stop-color', shape.color);
    gradMid.attr('stop-color', shape.color);
    gradBot.attr('stop-color', shape.color);
    tracePath.attr('stroke', shape.color);
    headDot.attr('fill', shape.color);
    headRing.attr('stroke', shape.color);
    hrvBandPath.attr('fill', hrvTone);
    hrvMicroPath.attr('stroke', hrvTone);
  }

  function renderPaths() {
    hrvBandPath.datum(hrvBandSamples).attr('d', hrvBandGen);
    hrvMicroPath.datum(hrvMicroSamples).attr('d', hrvMicroLineGen);

    areaPath.datum(samples).attr('d', areaGen);
    tracePath
      .datum(samples)
      .attr('d', lineGen)
      .attr('stroke-width', (1.85 + headGlow * 0.95).toFixed(2))
      .attr('filter', headGlow > 0.18 ? 'url(#lens-d3-glow)' : null);

    // 30-second trailing average BPM trend line
    const latestAvg = avgSamples[BUFFER_SIZE - 1];
    const avgStroke = latestAvg > DEFAULT_CRITICAL_BPM ? AVG_COLOR_CRITICAL : AVG_COLOR_DEFAULT;
    const avgD = avgLineGen(avgSamples);
    avgHaloPath.attr('d', avgD);
    avgPath.attr('d', avgD).attr('stroke', avgStroke);

    const headX = xScale(BUFFER_SIZE - 1);
    avgHeadDot.attr('cx', headX).attr('cy', bpmScale(latestAvg)).attr('fill', avgStroke);

    // Highlight audio-triggered sharp peaks traveling across the live graph
    const peakPoints = [];
    for (let i = 4; i < BUFFER_SIZE - 2; i++) {
      if (peakFlags[i] && samples[i] >= samples[i - 1] && samples[i] >= samples[i + 1]) {
        peakPoints.push({ index: i, value: samples[i] });
      }
    }

    spikeMarkersLayer
      .selectAll('circle.spike-peak')
      .data(peakPoints)
      .join('circle')
      .attr('class', 'spike-peak')
      .attr('cx', (d) => xScale(d.index))
      .attr('cy', (d) => yScale(d.value))
      .attr('r', 2.4)
      .attr('fill', shape.color)
      .attr('opacity', (d) => Math.max(0.25, (d.index / BUFFER_SIZE) * 0.95));

    const lastVal = samples[BUFFER_SIZE - 1];
    const headY = yScale(lastVal);

    headDot.attr('cx', headX).attr('cy', headY).attr('r', (2.5 + headGlow * 1.4).toFixed(2));
    headRing
      .attr('cx', headX)
      .attr('cy', headY)
      .attr('r', (3.5 + (1 - headGlow) * 9.5).toFixed(2))
      .attr('opacity', (headGlow * 0.72).toFixed(3));

    if (hoverIndex !== null) {
      renderHoverProbe();
    }
  }

  /**
   * Builds a short, crisp high-energy spike envelope injected directly into the live
   * D3 sample stream when the boom-boom audio fires — sharpest during stress / sleep-debt.
   */
  function enqueueAudioSpike(kind) {
    const isHighStress =
      activeProfile === 'stress' ||
      activeProfile === 'sleep-debt' ||
      activeProfile === 'tactical';
    const hrv = hrvEngine.getState();

    if (kind === 'lub') {
      const peak = (shape.rAmp + shape.audioBoostGain + (isHighStress ? 0.16 : 0.04)) * hrv.rAmpScale;
      const qDip = -(shape.qDepth + (isHighStress ? 0.16 : 0.06));
      const sDip = -(shape.sDepth + (isHighStress ? 0.18 : 0.08));

      // Tighter sample count in stress/sleep-debt creates a visibly steeper, sharper needle spike
      const pulse = isHighStress
        ? [
            { v: qDip * 0.55, peak: false },
            { v: qDip, peak: false },
            { v: peak * 0.62, peak: false },
            { v: peak, peak: true },
            { v: peak * 0.35, peak: false },
            { v: sDip, peak: false },
            { v: sDip * 0.42, peak: false },
            { v: 0.05, peak: false },
          ]
        : [
            { v: qDip * 0.5, peak: false },
            { v: qDip, peak: false },
            { v: peak * 0.45, peak: false },
            { v: peak * 0.85, peak: false },
            { v: peak, peak: true },
            { v: peak * 0.65, peak: false },
            { v: sDip * 0.8, peak: false },
            { v: sDip * 0.35, peak: false },
            { v: 0.04, peak: false },
          ];
      liveSpikeQueue = pulse;
      activeAudioBoost = 1;
      transientSurgeBpm = Math.min(28, transientSurgeBpm * 0.45 + shape.transientSpikeBpm);
      headGlow = 1;
      // Align cycle phase right after S-wave so the autonomous rhythm flows naturally into T-wave
      cyclePhase = 0.36;
    } else {
      // S2 ("boom") valve closure echo: crisp secondary T/dicrotic bump
      const dubH = (shape.tAmp + (isHighStress ? 0.24 : 0.1)) * hrv.tAmpScale;
      liveSpikeQueue = [
        { v: dubH * 0.55, peak: false },
        { v: dubH, peak: false },
        { v: dubH * 0.52, peak: false },
        { v: 0.04, peak: false },
      ];
      dubEchoBoost = 1;
      transientSurgeBpm = Math.max(transientSurgeBpm, shape.transientSpikeBpm * 0.5);
      headGlow = Math.max(headGlow, 0.72);
    }
  }

  function stepSample() {
    samples.shift();
    peakFlags.shift();
    avgSamples.shift();
    instantBpmSamples.shift();
    hrvBandSamples.shift();
    hrvMicroSamples.shift();
    hrvRmssdSamples.shift();

    const prevHrv = hrvEngine.getState();
    const roughBpm = Math.max(42, Math.min(164, shape.bpm + transientSurgeBpm + prevHrv.bpmDelta));
    const phaseStep = roughBpm / 60 / SAMPLE_RATE_HZ;
    const nextPhase = cyclePhase + phaseStep;
    const beatWrapped = liveSpikeQueue.length === 0 && nextPhase >= 1;

    const hrv = hrvEngine.step(1 / SAMPLE_RATE_HZ, {
      baseBpm: shape.bpm,
      beatWrapped,
      audioStressBoost: activeAudioBoost,
    });

    const effectiveBpm = Math.max(42, Math.min(164, shape.bpm + transientSurgeBpm + hrv.bpmDelta));
    const trendState = trendTracker.pushSample(effectiveBpm);

    if (liveSpikeQueue.length > 0) {
      const next = liveSpikeQueue.shift();
      samples.push(next.v + hrv.baselineMicro * 0.55);
      peakFlags.push(next.peak);
    } else {
      cyclePhase = nextPhase % 1;
      const val = sampleHeartbeat(cyclePhase, shape, activeAudioBoost, dubEchoBoost, hrv);
      samples.push(val);
      peakFlags.push(false);
    }

    instantBpmSamples.push(effectiveBpm);
    avgSamples.push(trendState.trailingAvgBpm);
    hrvMicroSamples.push(hrv.baselineMicro);
    hrvRmssdSamples.push(hrv.rmssdMs);
    hrvBandSamples.push({
      low: trendState.trailingAvgBpm - hrv.bandSpreadBpm + hrv.bpmDelta * 0.22,
      high: trendState.trailingAvgBpm + hrv.bandSpreadBpm + hrv.bpmDelta * 0.22,
    });

    activeAudioBoost *= 0.9;
    if (activeAudioBoost < 0.01) activeAudioBoost = 0;
    dubEchoBoost *= 0.87;
    if (dubEchoBoost < 0.01) dubEchoBoost = 0;
    // Fast, clean exponential decay so boom-boom bursts settle immediately with zero lingering aftermath
    transientSurgeBpm *= 0.92;
    if (transientSurgeBpm < 0.15) transientSurgeBpm = 0;
  }

  function tick(ts) {
    if (disposed) return;
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
    lastTs = ts;

    if (!isPaused() && !isOffscreen && !document.hidden) {
      headGlow *= Math.exp(-dt * 5.6);
      if (headGlow < 0.005) headGlow = 0;
      accumulator += dt;
      const stepDt = 1 / SAMPLE_RATE_HZ;
      let stepped = false;
      while (accumulator >= stepDt) {
        stepSample();
        accumulator -= stepDt;
        stepped = true;
      }
      if (stepped || headGlow > 0.01) {
        renderPaths();
        if (stepped) emitTrend(false, ts);
      }
    } else {
      accumulator = 0;
    }

    rafId = requestAnimationFrame(tick);
  }

  function handleResize() {
    const nextW = Math.max(240, Math.round(container.clientWidth || 440));
    if (nextW === width) return;
    width = nextW;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    xScale.range([margin.left, width - margin.right]);
    renderGrid();
    renderPaths();
  }

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', handleResize);
  }

  let intersectionObserver = null;
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          isOffscreen = !entry.isIntersecting;
          if (!isOffscreen) {
            lastTs = 0;
          }
        }
      },
      { threshold: 0.01 }
    );
    intersectionObserver.observe(container);
  }

  renderGrid();
  applyPalette();
  renderPaths();
  emitTrend(true);

  if (!prefersReducedMotion) {
    rafId = requestAnimationFrame(tick);
  }

  return {
    setProfile(profileId) {
      if (!PROFILE_SHAPES[profileId]) return;
      const changed = profileId !== activeProfile;
      activeProfile = profileId;
      shape = PROFILE_SHAPES[profileId];
      hrvEngine.setProfile(profileId);
      applyPalette();
      if (prefersReducedMotion) {
        if (changed) seedBuffer(false, { resetTracker: false });
      } else if (changed) {
        stepSample();
      }
      renderPaths();
      emitTrend(true);
    },
    triggerBeat(kind = 'lub') {
      if (disposed) return;
      if (prefersReducedMotion) {
        headGlow = kind === 'lub' ? 0.9 : 0.6;
        seedBuffer(true, { resetTracker: false });
        renderPaths();
        emitTrend(true);
        return;
      }
      enqueueAudioSpike(kind);
      stepSample();
      renderPaths();
      emitTrend(true);
    },
    getTrendState() {
      return buildCombinedTrendState();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      root.selectAll('*').remove();
    },
  };
}
