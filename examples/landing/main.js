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

  for (const study of matches) {
    const card = document.createElement('article');
    card.className = 'study-card';
    card.style.setProperty('--study-accent', study.accent);

    const top = document.createElement('div');

    const kicker = document.createElement('p');
    kicker.className = 'study-kicker';
    kicker.textContent = study.kicker;

    const title = document.createElement('h3');
    title.className = 'study-title';
    title.textContent = study.title;

    const desc = document.createElement('p');
    desc.className = 'study-desc';
    desc.textContent = study.description;

    top.append(kicker, title, desc);

    const footer = document.createElement('div');
    footer.className = 'study-footer';

    const actions = document.createElement('div');
    actions.className = 'study-actions';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'study-btn-preview';
    previewBtn.textContent = 'Preview 3D';
    previewBtn.addEventListener('click', () => openStudyModal(study));

    const openLink = document.createElement('a');
    openLink.className = 'study-btn-open';
    openLink.href = `./${study.id}/`;
    openLink.textContent = 'Open page';

    actions.append(previewBtn, openLink);

    const idSpan = document.createElement('span');
    idSpan.className = 'study-id';
    idSpan.textContent = `/${study.id}/`;

    footer.append(actions, idSpan);
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

// Heart Intro Component Lifecycle
const introContainer = document.getElementById('heart-intro');
let activeIntro = null;

function launchHeartIntro({ scrollTop = false } = {}) {
  if (!introContainer) return;
  if (scrollTop) window.scrollTo({ top: 0, behavior: 'auto' });
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
