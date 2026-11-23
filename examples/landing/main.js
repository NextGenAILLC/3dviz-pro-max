import { artScience, breadth } from '../shared/catalog.js';
import { mountHeartIntro } from './heart-intro.js';

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

function openStudyModal(study) {
  if (!dialogEl || !dialogFrame) return;
  if (dialogTitle) dialogTitle.textContent = study.title;
  if (dialogLink) dialogLink.href = `./${study.id}/`;
  dialogFrame.src = `./${study.id}/?embed=1`;
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
  searchTerm = e.target.value || '';
  renderStudies();
});

renderTabs();
renderStudies();

// Smooth section scrolling within .main-viewport & active sidebar highlight
const mainViewport = document.getElementById('main-viewport');
const navLinks = Array.from(document.querySelectorAll('.nav-list a[data-nav-link]'));
const sectionTargets = {
  top: { el: document.getElementById('top'), label: '00 / TOP' },
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
  const observedIds = ['studies', 'showcase', 'workflow', 'directions'];
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

const skipIntroQuery = new URLSearchParams(window.location.search).get('skipIntro') === '1';
if (skipIntroQuery && introContainer) {
  introContainer.hidden = true;
  document.body.classList.remove('intro-locked');
} else {
  launchHeartIntro();
}

for (const btn of document.querySelectorAll('[data-replay-heart]')) {
  btn.addEventListener('click', () => launchHeartIntro({ scrollTop: true }));
}

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
}, { passive: true });
window.addEventListener('resize', () => {
  if (activeStatItem) positionStatTooltip(activeStatItem);
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isIntroActive()) return;

  if (e.key === 'Escape') {
    if (activeStatItem) {
      hideStatTooltip();
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
      window.location.assign('./heart/');
      break;
    case 'H':
      e.preventDefault();
      if (heartStudy) {
        openStudyModal(heartStudy);
        showShortcutToast('Preview · The Living Heart');
      } else {
        window.location.assign('./heart/');
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
