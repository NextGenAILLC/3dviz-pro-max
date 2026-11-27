import * as THREE from 'three';
import { applyPlate, applyEmbed } from './page-chrome.js';
import { createRenderLoop } from './render-loop.js';
import { createCameraRig } from './camera-orbit-follow.js';
import { createStudioRig } from './lighting-studio.js';
import { LOOKS } from './breadth/src/looks.js';
import { createNightLighting, NIGHT_VIEWS } from './breadth/src/night-lighting.js';

function createBackgroundTexture(zenith, horizon) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, zenith);
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '';
}

function formatRangeValue(value, step) {
  const s = String(step ?? 0.01);
  const decimals = s.includes('.') ? s.split('.')[1].length : 0;
  return Number(value).toFixed(decimals);
}

export async function mountScene({
  meta = {},
  createScene,
  kind = 'art-science',
  look = null,
  nightName = null,
  views: customViews = null,
} = {}) {
  applyPlate(document, window.location.search);
  applyEmbed(document, window.location.search);

  if (meta.accent) {
    document.documentElement.style.setProperty('--study-accent', meta.accent);
  }

  const isPlate = document.documentElement.dataset.plate === '1';
  const isEmbed = document.documentElement.dataset.embed === '1';

  const nightMeta = nightName ? NIGHT_VIEWS[nightName] : null;
  const initialTitle = nightMeta?.title || meta.title || 'Interactive study';
  const initialDescription = nightMeta?.description || meta.description || '';

  document.title = initialTitle;
  setText('kicker', meta.kicker || '');
  setText('title', initialTitle);
  setText('description', initialDescription);

  const headingEl = document.querySelector('.heading');
  const panelEl = document.querySelector('.panel');
  const panelSummary = panelEl?.querySelector(':scope > summary');
  const panelContentEl = panelEl?.querySelector('.panel-content');
  if (panelSummary) {
    panelSummary.textContent = 'System parameters';
  }
  if (headingEl && !isPlate && !isEmbed && !headingEl.querySelector('.back-home-link')) {
    const backLink = document.createElement('a');
    backLink.className = 'back-home-link';
    backLink.href = '../?skipIntro=1';
    backLink.textContent = '← 3Dviz Pro Max';
    headingEl.prepend(backLink);
  }
  if (panelEl && !isPlate && !isEmbed && window.matchMedia('(min-width: 1081px)').matches) {
    panelEl.open = true;
  }

  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('world');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');

  function showError(message) {
    if (loadingEl) loadingEl.hidden = true;
    if (viewport) viewport.setAttribute('aria-busy', 'false');
    if (errorEl) {
      if (message) errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }

  const lookCfg = look ? LOOKS[look] : null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: !lookCfg?.background,
      powerPreference: 'high-performance',
    });
  } catch {
    showError('This scene needs WebGL. Enable hardware acceleration and reload.');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  let bgTexture = null;
  if (lookCfg?.background) {
    if (lookCfg.background.model === 'gradient') {
      bgTexture = createBackgroundTexture(lookCfg.background.zenith, lookCfg.background.horizon);
      scene.background = bgTexture;
    } else {
      scene.background = new THREE.Color(lookCfg.background.zenith);
    }
  } else {
    scene.background = null;
    renderer.setClearColor(0x0a0a0c, 0);
  }

  let result;
  try {
    result = await createScene();
  } catch (err) {
    console.error(err);
    bgTexture?.dispose();
    renderer.dispose();
    showError(err?.message ? `Unable to load study: ${err.message}` : 'Unable to initialize this 3D study.');
    return;
  }

  const resolvedTitle = meta.title || result.title || initialTitle;
  const resolvedDescription = meta.description || nightMeta?.description || result.description || '';
  document.title = resolvedTitle;
  setText('title', resolvedTitle);
  setText('description', resolvedDescription);

  scene.add(result.group);

  const toneMode = lookCfg?.toneMapping?.mode;
  renderer.toneMapping =
    toneMode === 'Neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure =
    result.lighting?.exposure ?? lookCfg?.toneMapping?.exposure ?? 1.0;

  let studio = null;
  let nightRig = null;

  if (!lookCfg || lookCfg.lit !== false) {
    const lightCfg = result.lighting || {};
    const studioOptions = {
      subject: kind === 'breadth' ? [0, 0.14, 0] : [0, 0, 0],
      environmentIntensity:
        lightCfg.environment ?? lookCfg?.environmentIntensity ?? 0.25,
    };
    studio = createStudioRig(scene, renderer, studioOptions);
    if (typeof lightCfg.key === 'number') studio.key.intensity = lightCfg.key;
    if (typeof lightCfg.fill === 'number') studio.fill.intensity = lightCfg.fill;
    if (typeof lightCfg.rim === 'number') studio.rim.intensity = lightCfg.rim;
    if (typeof lightCfg.contact === 'number') studio.contact.intensity = lightCfg.contact;
    if (lightCfg.keyColor) studio.key.color.set(lightCfg.keyColor);
    if (lightCfg.fillColor) studio.fill.color.set(lightCfg.fillColor);

    if (nightName) {
      nightRig = createNightLighting(scene, renderer, studio);
      nightRig.activate(nightName, result);
    }
  }

  const defaultViews = {
    overview: { position: [4, 2.3, 8], target: [0, 0, 0] },
    detail: { position: [2, 1, 4.6], target: [0, 0, 0] },
  };
  const mergedViews = {
    overview: customViews?.overview || result.views?.overview || defaultViews.overview,
    detail: customViews?.detail || result.views?.detail || defaultViews.detail,
  };

  const width = viewport?.clientWidth || window.innerWidth || 1280;
  const height = viewport?.clientHeight || window.innerHeight || 720;
  const fov = lookCfg?.camera?.fovDeg ?? 36;
  const camera = new THREE.PerspectiveCamera(fov, width / Math.max(1, height), 0.01, 150);
  renderer.setSize(width, height, false);

  const limits =
    kind === 'breadth'
      ? { minPolarDeg: 5, maxPolarDeg: 175, minDist: 0.06, maxDist: 4.5 }
      : { minPolarDeg: 5, maxPolarDeg: 175, minDist: 0.8, maxDist: 35 };

  let loop;
  const invalidate = () => loop?.invalidate();

  const rig = createCameraRig({
    camera,
    canvas,
    limits,
    views: mergedViews,
    invalidate,
  });
  rig.setView('overview');

  const readoutsEl = document.getElementById('readouts');
  let readoutNodes = [];
  let lastReadoutKey = '';
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const studySlug = (pathParts[pathParts.length - 1] || 'study').toUpperCase();

  function updateReadouts() {
    if (!readoutsEl) return;
    const rawStats = typeof result.stats === 'function' ? result.stats() || [] : [];
    const stats = [
      { label: 'Study ID', value: `3DV-${studySlug}`, accent: true },
      ...(rawStats.length > 0
        ? rawStats
        : [
            { label: 'Category', value: meta.kicker || '3D Study' },
            { label: 'Mode', value: kind === 'breadth' ? 'Crafted Scene' : 'Interactive Model' },
          ]),
    ];

    if (stats.length !== readoutNodes.length) {
      readoutsEl.textContent = '';
      readoutNodes = stats.map((item) => {
        const card = document.createElement('div');
        card.className = item.accent ? 'readout-card readout-card--accent' : 'readout-card';
        const dt = document.createElement('span');
        dt.className = 'readout-label';
        dt.textContent = item.label;
        const dd = document.createElement('strong');
        dd.className = 'readout-value';
        dd.textContent = String(item.value);
        card.append(dt, dd);
        readoutsEl.append(card);
        return { dt, dd };
      });
      lastReadoutKey = stats.map((s) => `${s.label}:${s.value}`).join('|');
      return;
    }
    const nextKey = stats.map((s) => `${s.label}:${s.value}`).join('|');
    if (nextKey === lastReadoutKey) return;
    lastReadoutKey = nextKey;
    stats.forEach((item, i) => {
      readoutNodes[i].dt.textContent = item.label;
      readoutNodes[i].dd.textContent = String(item.value);
    });
  }

  const controlsHost = document.getElementById('subject-controls');
  const controlSyncers = [];

  if (controlsHost && Array.isArray(result.controls)) {
    for (const ctrl of result.controls) {
      if (ctrl.type === 'range') {
        const label = document.createElement('label');
        const row = document.createElement('span');
        row.className = 'control-header';
        const title = document.createElement('span');
        title.textContent = ctrl.label;
        const output = document.createElement('output');
        row.append(title, output);

        const input = document.createElement('input');
        input.type = 'range';
        input.id = ctrl.id;
        input.min = String(ctrl.min);
        input.max = String(ctrl.max);
        input.step = String(ctrl.step);
        input.setAttribute('aria-label', ctrl.label);

        const sync = () => {
          const val = ctrl.get();
          input.value = String(val);
          output.textContent = formatRangeValue(val, ctrl.step);
        };
        input.oninput = () => {
          ctrl.set(Number(input.value));
          result.update?.(0);
          syncAllControls();
          updateReadouts();
          invalidate();
        };
        label.append(row, input);
        controlsHost.append(label);
        controlSyncers.push(sync);
      } else if (ctrl.type === 'select') {
        const label = document.createElement('label');
        const title = document.createElement('span');
        title.textContent = ctrl.label;
        const select = document.createElement('select');
        select.id = ctrl.id;
        select.setAttribute('aria-label', ctrl.label);
        for (const opt of ctrl.options || []) {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          select.append(option);
        }
        const sync = () => {
          select.value = ctrl.get();
        };
        select.onchange = () => {
          ctrl.set(select.value);
          result.update?.(0);
          syncAllControls();
          updateReadouts();
          invalidate();
        };
        label.append(title, select);
        controlsHost.append(label);
        controlSyncers.push(sync);
      } else if (ctrl.type === 'button') {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = ctrl.id;
        const sync = () => {
          button.textContent = typeof ctrl.getLabel === 'function' ? ctrl.getLabel() : ctrl.label;
        };
        button.onclick = () => {
          ctrl.set();
          result.update?.(0);
          syncAllControls();
          updateReadouts();
          invalidate();
        };
        controlsHost.append(button);
        controlSyncers.push(sync);
      }
    }
  }

  function syncAllControls() {
    for (const sync of controlSyncers) sync();
    result.sync?.();
  }

  const onStorageSync = () => {
    syncAllControls();
    updateReadouts();
  };
  window.addEventListener('storage', onStorageSync);

  if (controlsHost && typeof result.bind === 'function') {
    result.bind(controlsHost, invalidate);
  }
  if (controlsHost && nightRig) {
    nightRig.bind(controlsHost, invalidate);
  }

  const aboutEl = document.getElementById('about');
  const modelNoteEl = document.getElementById('model-note');
  const sourcesEl = document.getElementById('sources');
  const craftNoteEl = document.getElementById('craft-note');

  const noteText = result.note || '';
  const craftText = result.craft || '';
  const sourcesList = Array.isArray(result.sources) ? result.sources : [];

  if (modelNoteEl) {
    modelNoteEl.textContent = noteText;
    modelNoteEl.hidden = !noteText;
  }
  if (craftNoteEl) {
    craftNoteEl.textContent = craftText;
    craftNoteEl.hidden = !craftText;
  }
  if (sourcesEl) {
    sourcesEl.textContent = '';
    for (const src of sourcesList) {
      const a = document.createElement('a');
      a.href = src.url;
      a.textContent = src.title;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      sourcesEl.append(a);
    }
    sourcesEl.hidden = sourcesList.length === 0;
  }
  if (aboutEl && !noteText && !craftText && sourcesList.length === 0) {
    aboutEl.hidden = true;
  }

  const desktopMedia = window.matchMedia('(min-width: 1081px)');
  function syncLayoutSlots() {
    if (!aboutEl || isPlate || isEmbed) return;
    if (desktopMedia.matches) {
      if (headingEl && aboutEl.parentElement !== headingEl) {
        headingEl.append(aboutEl);
        aboutEl.open = true;
      }
      if (panelEl) panelEl.open = true;
    } else if (panelContentEl && aboutEl.parentElement !== panelContentEl) {
      panelContentEl.append(aboutEl);
      aboutEl.open = false;
    }
  }
  syncLayoutSlots();
  desktopMedia.addEventListener?.('change', syncLayoutSlots);

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = prefersReducedMotion;

  const pauseBtn = document.getElementById('pause');
  const overviewBtn = document.getElementById('overview');
  const detailBtn = document.getElementById('detail');
  const resetBtn = document.getElementById('reset');

  function setActiveViewButton(name) {
    overviewBtn?.classList.toggle('is-active', name === 'overview');
    detailBtn?.classList.toggle('is-active', name === 'detail');
  }
  setActiveViewButton('overview');

  function syncPauseButton() {
    if (!pauseBtn) return;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'Resume motion' : 'Pause motion';
  }
  syncPauseButton();

  if (overviewBtn) {
    overviewBtn.onclick = () => {
      rig.setView('overview');
      setActiveViewButton('overview');
      invalidate();
    };
  }
  if (detailBtn) {
    detailBtn.onclick = () => {
      rig.setView('detail');
      setActiveViewButton('detail');
      invalidate();
    };
  }
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      paused = !paused;
      syncPauseButton();
      invalidate();
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      result.reset?.();
      rig.reset();
      setActiveViewButton('overview');
      syncAllControls();
      updateReadouts();
      invalidate();
    };
  }

  syncAllControls();
  updateReadouts();

  loop = createRenderLoop({
    draw(dt) {
      const effDt = paused ? 0 : dt;
      const sceneMoved = result.update ? Boolean(result.update(effDt)) : false;
      const needsAnim =
        !paused && (result.needsAnimation ? Boolean(result.needsAnimation()) : sceneMoved);
      const camMoving = rig.update(dt);
      if (!paused && (sceneMoved || needsAnim)) {
        syncAllControls();
        updateReadouts();
      }
      renderer.render(scene, camera);
      return needsAnim || camMoving;
    },
  });

  function onResize() {
    const w = viewport?.clientWidth || window.innerWidth || 1280;
    const h = viewport?.clientHeight || window.innerHeight || 720;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    invalidate();
  }

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined' && viewport) {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(viewport);
  } else {
    window.addEventListener('resize', onResize);
  }

  if (loadingEl) loadingEl.hidden = true;
  if (viewport) viewport.setAttribute('aria-busy', 'false');
  invalidate();

  const cleanup = () => {
    loop?.dispose();
    resizeObserver?.disconnect();
    desktopMedia.removeEventListener?.('change', syncLayoutSlots);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('storage', onStorageSync);
    rig.dispose();
    nightRig?.dispose();
    studio?.dispose();
    result.dispose?.();
    bgTexture?.dispose();
    renderer.dispose();
  };
  window.addEventListener('pagehide', cleanup, { once: true });
}
