import { artScience, breadth } from '../shared/catalog.js';
import { parseSafeQuery, redactPhi } from '../shared/phi-guard.js';
import { mountHeartIntro } from './heart-intro.js';
import { createHeartbeatAudio } from './heartbeat-audio.js';
import { mountHeartRhythmChart } from './heart-rhythm-chart.js';
import { getTacticalRecoverySnapshot } from './tactical-recovery.js';

const CHAPTERS = [
  {
    id: 'all',
    label: 'All Studies',
    ids: null,
  },
  {
    id: 'anatomy',
    label: 'Anatomy & Physiology',
    ids: ['heart', 'muscle-atlas', 'brain', 'sarcomere', 'arm', 'neuron', 'breathing', 'knee'],
  },
  {
    id: 'math',
    label: 'Mathematics',
    ids: ['svd', 'fourier', 'topology', 'complex', 'probability', 'bloch'],
  },
  {
    id: 'physics',
    label: 'Physics & Mechanisms',
    ids: ['chaos', 'optics', 'resonance', 'magnetic', 'differential', 'orrery', 'gears'],
  },
  {
    id: 'worlds',
    label: 'Crafted Worlds & Props',
    ids: ['cavern', 'stag', 'cottage', 'hall', 'guildhall', 'tower', 'market', 'lantern', 'well', 'tree', 'village'],
  },
  {
    id: 'lighting',
    label: 'Lighting Studies',
    ids: ['blue-hour', 'night-river', 'night-bridge', 'night-doorway', 'night-mill'],
  },
];

const BREADTH_FALLBACKS = {
  bloch: {
    title: 'The Qubit Compass',
    description: 'Interactive pure-state Bloch sphere displaying azimuth, polar angle, and probability amplitudes.',
  },
  gears: {
    title: 'Machined in Motion',
    description: 'Steel and brass spur gears on fixed shafts enforcing a 24:16 (3:2) angular-speed ratio.',
  },
  stag: {
    title: 'The Moonwood Stag',
    description: 'Planted forest-spirit character silhouette with articulated antlers and layered ground detail.',
  },
  cottage: {
    title: 'The Copperleaf Cottage',
    description: 'Timber-framed cottage miniature with sill drips, recessed casements, and pitched roof tiles.',
  },
  hall: {
    title: 'The Carpenters’ Long Hall',
    description: 'Long timber hall miniature featuring an entry porch, ridge crest, and paired chimneys.',
  },
  guildhall: {
    title: 'The Stonewright Guild',
    description: 'Two-storey stone guildhall miniature with dressed masonry corners and timber framing.',
  },
  tower: {
    title: 'The Moonwatch Tower',
    description: 'Tapered stone watchtower elevation with helical stair band, string courses, and conical roof.',
  },
  market: {
    title: 'The Harvest Counter',
    description: 'Close-readable market stall canopy paired with timber counters, grain sacks, and crates.',
  },
  lantern: {
    title: 'The Lamplighter’s Lantern',
    description: 'Octagonal wrought-iron lantern prop with glass glazing panes and warm practical core.',
  },
  well: {
    title: 'The Wishing Well',
    description: 'Dressed stone well collar, timber A-frame roof, rope windlass, and suspended bucket.',
  },
  tree: {
    title: 'The Windwritten Tree',
    description: 'Open-canopy branching study balancing tapered limbs with layered foliage shells.',
  },
  village: {
    title: 'Copperleaf Hollow',
    description: 'Integrated island village diorama uniting landmarks, lanes, watermill, stone bridge, and terrain.',
  },
  'blue-hour': {
    title: 'The Last Light',
    description: 'Low warm horizon key paired with cool sky fill across Copperleaf Hollow at dusk.',
  },
  'night-river': {
    title: 'Lanterns by the River',
    description: 'Practical-led night composition where riverbank lanterns carve pools out of deep darkness.',
  },
  'night-bridge': {
    title: 'Across the Lantern Bridge',
    description: 'Stone bridge receiver and shadow balance illuminated by bridge-head lantern posts.',
  },
  'night-doorway': {
    title: 'A Light at the Door',
    description: 'Tight doorway framing balancing timber recess shadows against warm threshold practicals.',
  },
  'night-mill': {
    title: 'The Mill After Dark',
    description: 'Watermill source-to-receiver contrast study overlooking the turning wheel and stream.',
  },
};

function buildCatalog() {
  const combined = { ...artScience, ...breadth };
  const chapterById = new Map();
  for (const ch of CHAPTERS) {
    if (!ch.ids) continue;
    for (const id of ch.ids) chapterById.set(id, ch);
  }

  const orderedIds = CHAPTERS.filter((c) => c.ids).flatMap((c) => c.ids);
  return orderedIds
    .filter((id) => combined[id])
    .map((id) => {
      const entry = combined[id];
      const fallback = BREADTH_FALLBACKS[id] || {};
      const chapter = chapterById.get(id);
      return {
        id,
        chapterId: chapter?.id || 'worlds',
        chapterLabel: chapter?.label || 'Study',
        kicker: entry.kicker || 'INTERACTIVE STUDY',
        title: entry.title || fallback.title || id,
        description: entry.description || fallback.description || 'Interactive Three.js study.',
        accent: entry.accent || '#0b7553',
      };
    });
}

const STUDIES = buildCatalog();

const tabsHost = document.getElementById('chapter-tabs');
const searchInput = document.getElementById('study-search');
const gridHost = document.getElementById('studies-grid');
const dialogEl = document.getElementById('study-dialog');
const dialogTitle = document.getElementById('study-dialog-title');
const dialogLink = document.getElementById('study-dialog-link');
const dialogFrame = document.getElementById('study-dialog-frame');
const dialogClose = document.getElementById('study-dialog-close');

let activeChapter = 'all';
let searchTerm = '';

function renderTabs() {
  if (!tabsHost) return;
  tabsHost.textContent = '';

  for (const ch of CHAPTERS) {
    const count = ch.ids ? ch.ids.length : STUDIES.length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chapter-tab';
    btn.setAttribute('aria-pressed', String(activeChapter === ch.id));
    btn.textContent = `${ch.label} (${count})`;
    btn.addEventListener('click', () => {
      activeChapter = ch.id;
      renderTabs();
      renderStudies();
    });
    tabsHost.append(btn);
  }
}

function openStudyModal(study, { query = '' } = {}) {
  if (!dialogEl || !dialogFrame) return;
  stopLensAudio();
  hideTacticalTooltip({ force: true });
  const suffix = query ? `&${query}` : '';
  const standaloneSuffix = query ? `?${query}` : '';
  if (dialogTitle) dialogTitle.textContent = study.title;
  if (dialogLink) dialogLink.href = `./${study.id}/${standaloneSuffix}`;
  dialogFrame.src = `./${study.id}/?embed=1${suffix}`;
  dialogEl.showModal();
}

function closeStudyModal() {
  if (!dialogEl) return;
  if (dialogEl.open) dialogEl.close();
  if (dialogFrame) dialogFrame.src = 'about:blank';
}

dialogClose?.addEventListener('click', closeStudyModal);
dialogEl?.addEventListener('cancel', () => {
  if (dialogFrame) dialogFrame.src = 'about:blank';
});
dialogEl?.addEventListener('click', (e) => {
  if (e.target === dialogEl) closeStudyModal();
});

function renderStudies() {
  if (!gridHost) return;
  const query = searchTerm.trim().toLowerCase();

  const matches = STUDIES.filter((item) => {
    if (activeChapter !== 'all' && item.chapterId !== activeChapter) return false;
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.kicker.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query)
    );
  });

  gridHost.textContent = '';

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'studies-empty';
    empty.textContent = 'No studies matched that filter. Clear the search box or switch chapters.';
    gridHost.append(empty);
    return;
  }

  for (let i = 0; i < matches.length; i++) {
    const study = matches[i];
    const card = document.createElement('article');
    card.className = 'card';

    const top = document.createElement('div');

    const kicker = document.createElement('span');
    kicker.className = 'label';
    kicker.textContent = `/${study.chapterLabel}/`;

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = study.title;

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = study.description;

    top.append(kicker, title, desc);

    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn btn-primary';
    previewBtn.textContent = 'Preview 3D';
    previewBtn.addEventListener('click', () => openStudyModal(study));

    const openLink = document.createElement('a');
    openLink.className = 'btn';
    openLink.href = `./${study.id}/`;
    openLink.textContent = 'Open Study';

    actions.append(previewBtn, openLink);

    const codeSpan = document.createElement('span');
    codeSpan.className = 'card-code';
    codeSpan.textContent = `#${String(i + 1).padStart(2, '0')}-${study.id.slice(0, 4).toUpperCase()}`;

    footer.append(actions, codeSpan);
    card.append(top, footer);
    gridHost.append(card);
  }
}

searchInput?.addEventListener('input', (e) => {
  const raw = e.target.value || '';
  const guarded = redactPhi(raw);
  if (guarded.blocked) {
    e.target.value = guarded.sanitized;
    showShortcutToast('Sensitive identifier blocked · synthetic sandbox only');
  }
  searchTerm = guarded.sanitized;
  renderStudies();
});

renderTabs();
renderStudies();

// Smooth section scrolling within .main-viewport & active sidebar highlight
const mainViewport = document.getElementById('main-viewport');
const navLinks = Array.from(document.querySelectorAll('.nav-list a[data-nav-link]'));
const sectionTargets = {
  top: { el: document.getElementById('top'), label: '00 / TOP' },
  'tactical-lens': { el: document.getElementById('tactical-lens'), label: 'TACTICAL LENS' },
  studies: { el: document.getElementById('studies'), label: '01 / STUDIES' },
  showcase: { el: document.getElementById('showcase'), label: '02 / SHOWCASE' },
  workflow: { el: document.getElementById('workflow'), label: '03 / WORKFLOW' },
  directions: { el: document.getElementById('directions'), label: '04 / DIRECTIONS' },
};

function setActiveNav(id) {
  for (const link of navLinks) {
    link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
  }
}

function scrollToSection(id, { announce = false } = {}) {
  const entry = sectionTargets[id];
  if (!entry?.el) return;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  entry.el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  if (id !== 'top') setActiveNav(id);
  else setActiveNav('');
  if (announce) showShortcutToast(`Jump · ${entry.label}`);
}

for (const link of document.querySelectorAll('[data-nav-link]')) {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    const id = href.slice(1);
    if (!sectionTargets[id]?.el) return;
    e.preventDefault();
    scrollToSection(id);
  });
}

if (typeof IntersectionObserver !== 'undefined') {
  const observedIds = ['tactical-lens', 'studies', 'showcase', 'workflow', 'directions'];
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) {
        setActiveNav(visible.target.id);
      }
    },
    {
      root: window.innerWidth > 860 ? mainViewport : null,
      rootMargin: '-15% 0px -55% 0px',
      threshold: [0.1, 0.35],
    }
  );
  for (const id of observedIds) {
    if (sectionTargets[id]?.el) observer.observe(sectionTargets[id].el);
  }
}

// Shortcut feedback toast & Keyboard Shortcuts Reference Modal
const toastEl = document.getElementById('shortcut-toast');
let toastTimer = null;

function showShortcutToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add('is-visible');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 200);
  }, 1150);
}

const shortcutsDialog = document.getElementById('shortcuts-dialog');
const shortcutsTrigger = document.getElementById('shortcuts-trigger');
const shortcutsClose = document.getElementById('shortcuts-dialog-close');

function openShortcutsDialog() {
  if (!shortcutsDialog || shortcutsDialog.open) return;
  shortcutsDialog.showModal();
}

function closeShortcutsDialog() {
  if (!shortcutsDialog || !shortcutsDialog.open) return;
  shortcutsDialog.close();
}

shortcutsTrigger?.addEventListener('click', openShortcutsDialog);
shortcutsClose?.addEventListener('click', closeShortcutsDialog);
shortcutsDialog?.addEventListener('click', (e) => {
  if (e.target === shortcutsDialog) closeShortcutsDialog();
});

// Heart Intro Component Lifecycle
const introContainer = document.getElementById('heart-intro');
let activeIntro = null;

function isIntroActive() {
  return Boolean(introContainer && !introContainer.hidden);
}

function launchHeartIntro({ scrollTop = false } = {}) {
  if (!introContainer) return;
  stopLensAudio();
  hideTacticalTooltip({ force: true });
  closeShortcutsDialog();
  closeStudyModal();
  if (scrollTop) {
    if (mainViewport) mainViewport.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  activeIntro?.destroy?.();
  activeIntro = mountHeartIntro({
    container: introContainer,
    onReveal: () => {
      document.body.classList.remove('intro-locked');
    },
    onComplete: () => {
      activeIntro = null;
    },
  });
}

const safeQuery = parseSafeQuery(window.location.search);

for (const btn of document.querySelectorAll('[data-replay-heart]')) {
  btn.addEventListener('click', () => launchHeartIntro({ scrollTop: true }));
}

// Containerized Tactical & Athletic Physiology Lens (Developer Heart Stress + Sports Injuries)
const LENS_HEART_PROFILES = {
  baseline: {
    id: 'baseline',
    label: 'Baseline Recovery',
    scopeTag: 'SYNTHETIC PULSE · BASELINE RECOVERY',
    bpm: 62,
    intensity: 0.2,
    color: '#92d6bd',
    recovery: 'Full diastolic fill',
    drive: 'Parasympathetic',
    demand: 'Nominal',
    summary:
      'Rested baseline rhythm with generous diastolic filling time between beats, balanced vagal tone, and low resting coronary demand.',
  },
  stress: {
    id: 'stress',
    label: 'Developer Stress',
    scopeTag: 'SYNTHETIC PULSE · SUSTAINED DEVELOPER STRESS',
    bpm: 96,
    intensity: 0.58,
    color: '#e2a568',
    recovery: 'Compressed',
    drive: 'Sympathetic Shift',
    demand: 'Moderate-High',
    summary:
      'Persistent deadline pressure elevates sympathetic drive, narrows recovery intervals, and increases myocardial work even while seated at the workstation.',
  },
  'sleep-debt': {
    id: 'sleep-debt',
    label: '72h Sleep Debt',
    scopeTag: 'SYNTHETIC PULSE · 72H SLEEP DEPRIVATION',
    bpm: 118,
    intensity: 0.86,
    color: '#e46b7b',
    recovery: 'Strained',
    drive: 'Sleep-Debt Overdrive',
    demand: 'Elevated',
    summary:
      'Days without sleep keep cortisol and sympathetic tone locked high — shortening diastolic fill recovery while driving persistent coronary oxygen demand.',
  },
  tactical: {
    id: 'tactical',
    label: 'Tactical Peak',
    scopeTag: 'SYNTHETIC PULSE · TACTICAL / ATHLETIC PEAK',
    bpm: 142,
    intensity: 1.0,
    color: '#ff6f80',
    recovery: 'Minimal window',
    drive: 'Peak Exertion Load',
    demand: 'Maximal',
    summary:
      'High-output athletic or tactical exertion drives rapid ventricular cadence where stroke efficiency, heat load, and post-effort down-regulation govern resilience.',
  },
};

const TACTICAL_FACTORS = [
  {
    id: 'cardiac-persistence',
    category: 'stress',
    kicker: 'Tactical Stress · Myocardial Load',
    title: 'Cardiac Persistence & Sleep Debt',
    description:
      'Models sympathetic overdrive, coronary perfusion demand, and compressed diastolic fill across multi-day developer sprints or sustained tactical operations.',
    factor: 'Primary lens: heart rate · myocardial strain · coronary flow',
    studyId: 'heart',
    query: 'profile=sleep-debt',
    secondaryId: 'brain',
    secondaryLabel: 'Preview Brain',
  },
  {
    id: 'knee-cut-load',
    category: 'injury',
    kicker: 'Sports Injury · Joint Torque',
    title: 'ACL, Meniscus & Deceleration Torque',
    description:
      'Inspects tibiofemoral alignment, patellar tracking, and flexion-extension shear zones where non-contact cutting, pivoting, and hard landings cause ligament trauma.',
    factor: 'Primary lens: joint shear · flexion arc · landing load',
    studyId: 'knee',
    query: '',
    secondaryId: null,
    secondaryLabel: '',
  },
  {
    id: 'upper-chain-overuse',
    category: 'injury',
    kicker: 'Sports Injury · Kinetic Chain',
    title: 'Upper-Chain Overuse & Compensation',
    description:
      'Maps humerus-radius-ulna torque transfer alongside layered upper-body muscle families to highlight throwing strain, rotator fatigue, and postural overload.',
    factor: 'Primary lens: tendon load · muscle recruitment · torque',
    studyId: 'arm',
    query: '',
    secondaryId: 'muscle-atlas',
    secondaryLabel: 'Muscle Atlas',
  },
  {
    id: 'microfiber-reset',
    category: 'recovery',
    kicker: 'Recovery · Autonomic Down-Regulation',
    title: 'Micro-Fiber Fatigue & Breath Reset',
    description:
      'Connects diaphragmatic dome mechanics for tactical box-breathing recovery with sarcomere actin-myosin cross-bridge strain during eccentric muscle fatigue.',
    factor: 'Primary lens: vagal reset · diaphragm excursion · fiber load',
    studyId: 'breathing',
    query: '',
    secondaryId: 'sarcomere',
    secondaryLabel: 'Sarcomere',
  },
];

const lensDeckEl = document.getElementById('heart-lens-deck');
const lensBpmEl = document.getElementById('lens-bpm-readout');
const lensScopeLabelEl = document.getElementById('lens-scope-label');
const lensAudioStateEl = document.getElementById('lens-scope-audio-state');
const lensRecoveryEl = document.getElementById('lens-metric-recovery');
const lensDriveEl = document.getElementById('lens-metric-drive');
const lensDemandEl = document.getElementById('lens-metric-demand');
const lensSummaryEl = document.getElementById('lens-state-summary');
const lensBoomBtn = document.getElementById('lens-boom-btn');
const lensPreviewBtn = document.getElementById('lens-preview-heart');
const lensOpenLink = document.getElementById('lens-open-heart');
const lensScopeFrameEl = document.getElementById('lens-scope-frame');
const lensScopeAlertBarEl = document.getElementById('lens-scope-alert-bar');
const lensScopeAlertBpmEl = document.getElementById('lens-scope-alert-bpm');
const lensAvgBpmEl = document.getElementById('lens-avg-bpm-readout');
const lensHrvEl = document.getElementById('lens-hrv-readout');
const lensTrendStatusEl = document.getElementById('lens-trend-status');
const lensChartHost = document.getElementById('lens-d3-chart');
const tacticalGridEl = document.getElementById('tactical-grid');
const lensProfileButtons = Array.from(document.querySelectorAll('[data-heart-profile]'));
const lensFilterButtons = Array.from(document.querySelectorAll('[data-lens-filter]'));

const tacticalTooltipEl = document.getElementById('tactical-tooltip');
const tacticalTooltipLoad = document.getElementById('tactical-tooltip-load');
const tacticalTooltipTitle = document.getElementById('tactical-tooltip-title');
const tacticalTooltipClose = document.getElementById('tactical-tooltip-close');
const tacticalTooltipMeterFill = document.getElementById('tactical-tooltip-meter-fill');
const tacticalTooltipReadiness = document.getElementById('tactical-tooltip-readiness');
const tacticalTooltipWindow = document.getElementById('tactical-tooltip-window');
const tacticalTooltipRiskLabel = document.getElementById('tactical-tooltip-risk-label');
const tacticalTooltipRiskValue = document.getElementById('tactical-tooltip-risk-value');
const tacticalTooltipImpact = document.getElementById('tactical-tooltip-impact');
const tacticalTooltipPrevention = document.getElementById('tactical-tooltip-prevention');
const tacticalTooltipMeta = document.getElementById('tactical-tooltip-meta');

const CRITICAL_BPM_THRESHOLD = 140;

let activeHeartProfile = safeQuery.profile || 'sleep-debt';
let activeLensFilter = safeQuery.lens || 'all';
let lensAudio = null;
let lensPlayingBoom = false;
let scopeAlertShakeTimer = null;
let scopeAlertBeatTimer = null;
let wasCriticalThreshold = false;
let activeTacticalCard = null;
let activeTacticalFactorId = null;
let tacticalTooltipPinned = false;
let tacticalHideTimer = null;

function syncTrendReadout(trend) {
  if (!trend) return;
  if (lensAvgBpmEl) {
    lensAvgBpmEl.textContent = `${trend.trailingAvgBpm.toFixed(1)} BPM`;
  }
  if (lensHrvEl && Number.isFinite(trend.rmssdMs)) {
    lensHrvEl.textContent = `${Math.round(trend.rmssdMs)} ms`;
  }
  if (lensTrendStatusEl) {
    lensTrendStatusEl.textContent = trend.label;
    lensTrendStatusEl.dataset.trend = trend.status;
  }
  if (lensScopeAlertBpmEl && wasCriticalThreshold) {
    const cfg = LENS_HEART_PROFILES[activeHeartProfile];
    const instant = cfg ? cfg.bpm : Math.round(trend.instantBpm);
    lensScopeAlertBpmEl.textContent = `${instant} BPM · 30S AVG ${trend.trailingAvgBpm.toFixed(1)}`;
  }
}

const rhythmChart = mountHeartRhythmChart({
  container: lensChartHost,
  initialProfile: activeHeartProfile,
  isPaused: () => isIntroActive() || Boolean(dialogEl?.open),
  onTrendUpdate: syncTrendReadout,
});

function positionTacticalTooltip(anchor) {
  if (!tacticalTooltipEl || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const tipRect = tacticalTooltipEl.getBoundingClientRect();
  const margin = 12;

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));

  let top = rect.top - tipRect.height - 10;
  if (top < margin) {
    top = rect.bottom + 10;
  }
  if (top + tipRect.height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - tipRect.height - margin);
  }

  tacticalTooltipEl.style.left = `${Math.round(left)}px`;
  tacticalTooltipEl.style.top = `${Math.round(top)}px`;
}

function showTacticalTooltip(card, factorId, { pin = false } = {}) {
  if (!tacticalTooltipEl || !card || isIntroActive() || dialogEl?.open) return;
  const snapshot = getTacticalRecoverySnapshot(factorId, activeHeartProfile);
  if (!snapshot) return;

  if (typeof activeStatItem !== 'undefined' && activeStatItem) {
    hideStatTooltip();
  }

  if (tacticalHideTimer !== null) {
    clearTimeout(tacticalHideTimer);
    tacticalHideTimer = null;
  }

  if (activeTacticalCard && activeTacticalCard !== card) {
    activeTacticalCard.classList.remove('is-tooltip-open');
    activeTacticalCard.removeAttribute('aria-describedby');
    activeTacticalCard.querySelector('.tactical-intel-btn')?.setAttribute('aria-expanded', 'false');
  }

  activeTacticalCard = card;
  activeTacticalFactorId = factorId;
  tacticalTooltipPinned = pin;

  card.classList.add('is-tooltip-open');
  card.setAttribute('aria-describedby', 'tactical-tooltip');
  card.querySelector('.tactical-intel-btn')?.setAttribute('aria-expanded', String(pin));

  tacticalTooltipEl.dataset.tone = snapshot.tone;
  tacticalTooltipEl.classList.toggle('is-pinned', pin);
  if (tacticalTooltipClose) tacticalTooltipClose.hidden = !pin;

  if (tacticalTooltipLoad) tacticalTooltipLoad.textContent = snapshot.loadLabel;
  if (tacticalTooltipTitle) tacticalTooltipTitle.textContent = snapshot.title;
  if (tacticalTooltipMeterFill) tacticalTooltipMeterFill.style.width = `${snapshot.readinessPct}%`;
  if (tacticalTooltipReadiness) tacticalTooltipReadiness.textContent = `${snapshot.readinessPct}%`;
  if (tacticalTooltipWindow) tacticalTooltipWindow.textContent = snapshot.recoveryWindow;
  if (tacticalTooltipRiskLabel) tacticalTooltipRiskLabel.textContent = snapshot.riskLabel;
  if (tacticalTooltipRiskValue) tacticalTooltipRiskValue.textContent = snapshot.riskValue;
  if (tacticalTooltipImpact) tacticalTooltipImpact.textContent = snapshot.tacticalImpact;
  if (tacticalTooltipPrevention) tacticalTooltipPrevention.textContent = snapshot.injuryPrevention;
  if (tacticalTooltipMeta) tacticalTooltipMeta.textContent = snapshot.meta;

  tacticalTooltipEl.hidden = false;
  positionTacticalTooltip(card);
  tacticalTooltipEl.classList.add('is-visible');
}

function hideTacticalTooltip({ anchor = null, force = false } = {}) {
  if (!tacticalTooltipEl) return;
  if (!force && tacticalTooltipPinned) return;
  if (!force && anchor && activeTacticalCard && anchor !== activeTacticalCard) return;

  if (activeTacticalCard) {
    activeTacticalCard.classList.remove('is-tooltip-open');
    activeTacticalCard.removeAttribute('aria-describedby');
    activeTacticalCard.querySelector('.tactical-intel-btn')?.setAttribute('aria-expanded', 'false');
    activeTacticalCard = null;
  }
  activeTacticalFactorId = null;
  tacticalTooltipPinned = false;
  tacticalTooltipEl.classList.remove('is-visible', 'is-pinned');
  if (tacticalTooltipClose) tacticalTooltipClose.hidden = true;

  if (tacticalHideTimer !== null) clearTimeout(tacticalHideTimer);
  tacticalHideTimer = window.setTimeout(() => {
    if (!activeTacticalCard) tacticalTooltipEl.hidden = true;
  }, 160);
}

tacticalTooltipClose?.addEventListener('click', () => {
  hideTacticalTooltip({ force: true });
});

document.addEventListener('pointerdown', (e) => {
  if (!tacticalTooltipPinned || !tacticalTooltipEl) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (
    target.closest('#tactical-tooltip') ||
    target.closest('.tactical-intel-btn') ||
    target.closest('[data-heart-profile]')
  ) {
    return;
  }
  hideTacticalTooltip({ force: true });
});

function stopLensAudio() {
  lensAudio?.stopSequence?.();
  lensPlayingBoom = false;
  if (lensBoomBtn) lensBoomBtn.textContent = 'Play Boom-Boom-Boom';
  if (lensAudioStateEl) lensAudioStateEl.textContent = 'AUDIO READY';
}

function triggerScopeShake() {
  if (!lensScopeFrameEl) return;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  lensScopeFrameEl.classList.remove('is-alert-shake');
  void lensScopeFrameEl.offsetWidth;
  lensScopeFrameEl.classList.add('is-alert-shake');
  if (scopeAlertShakeTimer !== null) clearTimeout(scopeAlertShakeTimer);
  scopeAlertShakeTimer = window.setTimeout(() => {
    lensScopeFrameEl.classList.remove('is-alert-shake');
    scopeAlertShakeTimer = null;
  }, 360);
}

function pulseScopeThresholdBeat() {
  if (!lensScopeFrameEl || !wasCriticalThreshold) return;
  lensScopeFrameEl.classList.add('is-alert-beat');
  if (scopeAlertBeatTimer !== null) clearTimeout(scopeAlertBeatTimer);
  scopeAlertBeatTimer = window.setTimeout(() => {
    lensScopeFrameEl.classList.remove('is-alert-beat');
    scopeAlertBeatTimer = null;
  }, 240);
  triggerScopeShake();
}

function updateScopeThresholdAlert(bpm, { allowShake = true } = {}) {
  const isCritical = bpm > CRITICAL_BPM_THRESHOLD;
  if (lensScopeFrameEl) {
    lensScopeFrameEl.classList.toggle('is-critical', isCritical);
    if (!isCritical) {
      lensScopeFrameEl.classList.remove('is-alert-shake', 'is-alert-beat');
    }
  }
  if (lensScopeAlertBarEl) {
    lensScopeAlertBarEl.hidden = !isCritical;
  }
  if (lensScopeAlertBpmEl && isCritical) {
    const trend = rhythmChart.getTrendState?.();
    lensScopeAlertBpmEl.textContent = trend
      ? `${bpm} BPM · 30S AVG ${trend.trailingAvgBpm.toFixed(1)}`
      : `${bpm} BPM`;
  }
  if (isCritical && allowShake && !wasCriticalThreshold) {
    triggerScopeShake();
  }
  wasCriticalThreshold = isCritical;
}

function applyHeartProfile(profileId, { allowShake = true } = {}) {
  const cfg = LENS_HEART_PROFILES[profileId] || LENS_HEART_PROFILES['sleep-debt'];
  activeHeartProfile = cfg.id;

  if (lensDeckEl) lensDeckEl.dataset.profile = cfg.id;
  if (lensBpmEl) lensBpmEl.textContent = `${cfg.bpm} BPM`;
  if (lensScopeLabelEl) lensScopeLabelEl.textContent = cfg.scopeTag;
  if (lensRecoveryEl) lensRecoveryEl.textContent = cfg.recovery;
  if (lensDriveEl) lensDriveEl.textContent = cfg.drive;
  if (lensDemandEl) lensDemandEl.textContent = cfg.demand;
  if (lensSummaryEl) lensSummaryEl.textContent = cfg.summary;
  if (lensOpenLink) lensOpenLink.href = `./heart/?profile=${cfg.id}`;
  const sidebarHeartLink = document.getElementById('open-heart-link');
  if (sidebarHeartLink) sidebarHeartLink.href = `./heart/?profile=${cfg.id}`;

  for (const btn of lensProfileButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.heartProfile === cfg.id));
  }
  rhythmChart.setProfile(cfg.id);
  updateScopeThresholdAlert(cfg.bpm, { allowShake });
  lensAudio?.setStressIntensity?.(cfg.intensity);

  const pinnedId = tacticalTooltipPinned ? activeTacticalFactorId : null;
  renderTacticalCards();
  if (pinnedId && tacticalGridEl) {
    const matched = tacticalGridEl.querySelector(`.tactical-card[data-factor-id="${pinnedId}"]`);
    if (matched) {
      showTacticalTooltip(matched, pinnedId, { pin: true });
    } else {
      hideTacticalTooltip({ force: true });
    }
  }
}

for (const btn of lensProfileButtons) {
  btn.addEventListener('click', () => {
    const id = btn.dataset.heartProfile;
    if (!id) return;
    applyHeartProfile(id, { allowShake: true });
    const cfg = LENS_HEART_PROFILES[id];
    showShortcutToast(
      cfg.bpm > CRITICAL_BPM_THRESHOLD
        ? `Critical Stress Alert · ${cfg.bpm} BPM`
        : `Heart Profile · ${cfg.label}`
    );
  });
}

lensBoomBtn?.addEventListener('click', () => {
  const cfg = LENS_HEART_PROFILES[activeHeartProfile] || LENS_HEART_PROFILES['sleep-debt'];
  if (!lensAudio) {
    lensAudio = createHeartbeatAudio();
  }
  lensPlayingBoom = true;
  if (lensBoomBtn) lensBoomBtn.textContent = 'Boom-Boom-Boom Active…';
  if (lensAudioStateEl) lensAudioStateEl.textContent = `SURGE · ${cfg.bpm} BPM`;

  lensAudio.playBoomSequence({
    beats: 3,
    bpm: cfg.bpm,
    intensity: cfg.intensity,
    boost: true,
    onBeat: (_idx, kind) => {
      rhythmChart.triggerBeat(kind);
      if (kind === 'lub' && cfg.bpm > CRITICAL_BPM_THRESHOLD) {
        pulseScopeThresholdBeat();
      }
    },
    onDone: () => {
      lensPlayingBoom = false;
      if (lensBoomBtn) lensBoomBtn.textContent = 'Play Boom-Boom-Boom';
      if (lensAudioStateEl) lensAudioStateEl.textContent = 'AUDIO READY';
    },
  });
});

lensPreviewBtn?.addEventListener('click', () => {
  const heartEntry = STUDIES.find((item) => item.id === 'heart');
  if (!heartEntry) return;
  openStudyModal(heartEntry, { query: `profile=${activeHeartProfile}` });
});

function renderTacticalCards() {
  if (!tacticalGridEl) return;
  if (!tacticalTooltipPinned) {
    hideTacticalTooltip({ force: true });
  }
  const visible = TACTICAL_FACTORS.filter(
    (item) => activeLensFilter === 'all' || item.category === activeLensFilter
  );
  tacticalGridEl.textContent = '';

  for (const item of visible) {
    const study = STUDIES.find((s) => s.id === item.studyId);
    const secondary = item.secondaryId ? STUDIES.find((s) => s.id === item.secondaryId) : null;
    const snapshot = getTacticalRecoverySnapshot(item.id, activeHeartProfile);
    const card = document.createElement('article');
    card.className = 'tactical-card';
    card.dataset.factorId = item.id;

    const top = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'tactical-card-head';

    const kicker = document.createElement('span');
    kicker.className = 'label';
    kicker.textContent = item.kicker;

    const intelBtn = document.createElement('button');
    intelBtn.type = 'button';
    intelBtn.className = 'tactical-intel-btn';
    intelBtn.setAttribute('aria-expanded', 'false');
    intelBtn.setAttribute('aria-label', `Inspect recovery and injury prevention intel for ${item.title}`);
    intelBtn.textContent = snapshot ? `Intel · ${snapshot.readinessPct}%` : 'Intel ?';

    intelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tacticalTooltipPinned && activeTacticalFactorId === item.id) {
        hideTacticalTooltip({ force: true });
      } else {
        showTacticalTooltip(card, item.id, { pin: true });
      }
    });
    intelBtn.addEventListener('focus', () => {
      if (!tacticalTooltipPinned) {
        showTacticalTooltip(card, item.id, { pin: false });
      }
    });
    intelBtn.addEventListener('blur', () => {
      if (!tacticalTooltipPinned) {
        hideTacticalTooltip({ anchor: card });
      }
    });

    head.append(kicker, intelBtn);

    const title = document.createElement('h4');
    title.className = 'tactical-card-title';
    title.textContent = item.title;

    const desc = document.createElement('p');
    desc.className = 'tactical-card-desc';
    desc.textContent = item.description;

    const factor = document.createElement('p');
    factor.className = 'tactical-card-factor';
    factor.textContent = item.factor;

    top.append(head, title, desc, factor);

    const actions = document.createElement('div');
    actions.className = 'tactical-card-actions';

    if (study) {
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'btn btn-primary';
      preview.textContent = 'Preview 3D';
      preview.addEventListener('click', () => {
        const q = item.studyId === 'heart' ? `profile=${activeHeartProfile}` : item.query;
        openStudyModal(study, { query: q });
      });

      const openLink = document.createElement('a');
      openLink.className = 'btn';
      openLink.href = item.studyId === 'heart'
        ? `./heart/?profile=${activeHeartProfile}`
        : `./${item.studyId}/`;
      openLink.textContent = 'Open Study';
      actions.append(preview, openLink);
    }

    if (secondary) {
      const secBtn = document.createElement('button');
      secBtn.type = 'button';
      secBtn.className = 'btn';
      secBtn.textContent = item.secondaryLabel;
      secBtn.addEventListener('click', () => openStudyModal(secondary));
      actions.append(secBtn);
    }

    card.addEventListener('mouseenter', () => {
      if (!tacticalTooltipPinned) {
        showTacticalTooltip(card, item.id, { pin: false });
      }
    });
    card.addEventListener('mouseleave', () => {
      if (!tacticalTooltipPinned) {
        hideTacticalTooltip({ anchor: card });
      }
    });

    card.append(top, actions);
    tacticalGridEl.append(card);
  }
}

for (const btn of lensFilterButtons) {
  btn.addEventListener('click', () => {
    activeLensFilter = btn.dataset.lensFilter || 'all';
    for (const b of lensFilterButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.lensFilter === activeLensFilter));
    }
    hideTacticalTooltip({ force: true });
    renderTacticalCards();
  });
}

for (const b of lensFilterButtons) {
  b.setAttribute('aria-pressed', String(b.dataset.lensFilter === activeLensFilter));
}
applyHeartProfile(activeHeartProfile, { allowShake: false });

if (safeQuery.skipIntro && introContainer) {
  introContainer.hidden = true;
  document.body.classList.remove('intro-locked');
} else {
  launchHeartIntro();
}

window.addEventListener('pagehide', () => {
  if (scopeAlertShakeTimer !== null) clearTimeout(scopeAlertShakeTimer);
  if (scopeAlertBeatTimer !== null) clearTimeout(scopeAlertBeatTimer);
  rhythmChart.destroy();
  lensAudio?.dispose?.();
  lensAudio = null;
});

// Global Keyboard Shortcuts (guarded against inputs, modifiers, intro, and active study modal)
function isTypingElement(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

const heartStudy = STUDIES.find((item) => item.id === 'heart');

// Dynamic hover & focus tooltips for stats-strip metrics
const STAT_TOOLTIPS = {
  studies: {
    title: '37 Interactive Studies',
    body: 'Organized into five chapters: Anatomy & Physiology, Mathematics, Physics & Mechanisms, Crafted Worlds & Props, and Lighting Studies. Every study ships with Overview/Close-up views, orbit controls, subject parameters, and explicit modeling limits.',
    meta: '37 runnable entrypoints · 5 chapters',
  },
  recipes: {
    title: '223 Authored Recipes',
    body: 'Covers all 24 registered visualization directions with at least six authored recipes per direction. Twenty-one recipes carry numeric starting defaults paired with worked expected values for verification.',
    meta: '24 directions · ≥ 6 recipes each',
  },
  records: {
    title: '440 Knowledge Records',
    body: 'Curated authoring guidance across 18 families — lighting moods, style profiles, camera lenses, materials, and geometry rules — backed by 451 sources and 3,599 archive evidence events.',
    meta: '18 families · 69 numeric defaults',
  },
  kits: {
    title: '22 Blueprint Kits',
    body: 'Each kit pairs a blueprint record, a reusable Three.js module, and four GPU proof captures verified by SHA-256 checksums. Eighteen kits are proved at T2 (procedural textures + vertex-baked occlusion) and two at T3 (Blender bakes).',
    meta: 'SHA-256 verified · 18 T2 + 2 T3 bakes',
  },
};

const statTooltipEl = document.getElementById('stat-tooltip');
const statTooltipTitle = document.getElementById('stat-tooltip-title');
const statTooltipBody = document.getElementById('stat-tooltip-body');
const statTooltipMeta = document.getElementById('stat-tooltip-meta');
const statItems = Array.from(document.querySelectorAll('.stat-item[data-stat-key]'));
let activeStatItem = null;
let statHideTimer = null;

function positionStatTooltip(anchor) {
  if (!statTooltipEl || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const tipRect = statTooltipEl.getBoundingClientRect();
  const margin = 12;

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));

  let top = rect.bottom + 10;
  if (top + tipRect.height > window.innerHeight - margin && rect.top - tipRect.height - 10 >= margin) {
    top = rect.top - tipRect.height - 10;
  }

  statTooltipEl.style.left = `${Math.round(left)}px`;
  statTooltipEl.style.top = `${Math.round(top)}px`;
}

function showStatTooltip(anchor) {
  if (!statTooltipEl || !anchor || isIntroActive()) return;
  const key = anchor.dataset.statKey;
  const data = key ? STAT_TOOLTIPS[key] : null;
  if (!data) return;

  if (activeTacticalCard) {
    hideTacticalTooltip({ force: true });
  }

  if (statHideTimer !== null) {
    clearTimeout(statHideTimer);
    statHideTimer = null;
  }

  if (activeStatItem && activeStatItem !== anchor) {
    activeStatItem.classList.remove('is-tooltip-open');
    activeStatItem.removeAttribute('aria-describedby');
  }

  activeStatItem = anchor;
  anchor.classList.add('is-tooltip-open');
  anchor.setAttribute('aria-describedby', 'stat-tooltip');

  if (statTooltipTitle) statTooltipTitle.textContent = data.title;
  if (statTooltipBody) statTooltipBody.textContent = data.body;
  if (statTooltipMeta) statTooltipMeta.textContent = data.meta;

  statTooltipEl.hidden = false;
  positionStatTooltip(anchor);
  statTooltipEl.classList.add('is-visible');
}

function hideStatTooltip(anchor = null) {
  if (!statTooltipEl) return;
  if (anchor && activeStatItem && anchor !== activeStatItem) return;

  if (activeStatItem) {
    activeStatItem.classList.remove('is-tooltip-open');
    activeStatItem.removeAttribute('aria-describedby');
    activeStatItem = null;
  }
  statTooltipEl.classList.remove('is-visible');
  if (statHideTimer !== null) clearTimeout(statHideTimer);
  statHideTimer = window.setTimeout(() => {
    if (!activeStatItem) statTooltipEl.hidden = true;
  }, 160);
}

for (const item of statItems) {
  item.addEventListener('mouseenter', () => showStatTooltip(item));
  item.addEventListener('mouseleave', () => hideStatTooltip(item));
  item.addEventListener('focus', () => showStatTooltip(item));
  item.addEventListener('blur', () => hideStatTooltip(item));
  item.addEventListener('click', () => {
    if (activeStatItem === item) hideStatTooltip(item);
    else showStatTooltip(item);
  });
}

mainViewport?.addEventListener('scroll', () => {
  if (activeStatItem) hideStatTooltip();
  if (activeTacticalCard) hideTacticalTooltip({ force: true });
}, { passive: true });
window.addEventListener('resize', () => {
  if (activeStatItem) positionStatTooltip(activeStatItem);
  if (activeTacticalCard) positionTacticalTooltip(activeTacticalCard);
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isIntroActive()) return;

  if (e.key === 'Escape') {
    if (activeStatItem) {
      hideStatTooltip();
    }
    if (activeTacticalCard) {
      hideTacticalTooltip({ force: true });
    }
    if (shortcutsDialog?.open) {
      e.preventDefault();
      closeShortcutsDialog();
      return;
    }
    if (document.activeElement === searchInput) {
      searchInput.blur();
      return;
    }
    return;
  }

  if (isTypingElement(e.target)) return;

  if (e.key === '?') {
    e.preventDefault();
    if (dialogEl?.open) return;
    if (shortcutsDialog?.open) closeShortcutsDialog();
    else openShortcutsDialog();
    return;
  }

  if (dialogEl?.open || shortcutsDialog?.open) return;

  switch (e.key) {
    case '0':
    case 't':
    case 'T':
      e.preventDefault();
      scrollToSection('top', { announce: true });
      break;
    case 'l':
    case 'L':
      e.preventDefault();
      scrollToSection('tactical-lens', { announce: true });
      break;
    case '1':
      e.preventDefault();
      scrollToSection('studies', { announce: true });
      break;
    case '2':
      e.preventDefault();
      scrollToSection('showcase', { announce: true });
      break;
    case '3':
      e.preventDefault();
      scrollToSection('workflow', { announce: true });
      break;
    case '4':
      e.preventDefault();
      scrollToSection('directions', { announce: true });
      break;
    case '/':
      e.preventDefault();
      scrollToSection('studies');
      searchInput?.focus();
      showShortcutToast('Filter studies');
      break;
    case 'h':
      e.preventDefault();
      showShortcutToast('Opening The Living Heart…');
      window.location.assign(`./heart/?profile=${activeHeartProfile}`);
      break;
    case 'H':
      e.preventDefault();
      if (heartStudy) {
        openStudyModal(heartStudy, { query: `profile=${activeHeartProfile}` });
        showShortcutToast('Preview · The Living Heart');
      } else {
        window.location.assign(`./heart/?profile=${activeHeartProfile}`);
      }
      break;
    case 'r':
    case 'R':
      e.preventDefault();
      hideStatTooltip();
      launchHeartIntro({ scrollTop: true });
      break;
    default:
      break;
  }
});
