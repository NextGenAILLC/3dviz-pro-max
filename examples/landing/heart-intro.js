import * as THREE from 'three';
import { createScene } from '../shared/art-science/scenes/heart.js';
import { createStudioRig } from '../shared/lighting-studio.js';
import { disposeGroup } from '../shared/art-science/scene-kit.js';
import { createHeartbeatAudio } from './heartbeat-audio.js';

function detectSoftwareWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return { supported: false, software: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const software = /swiftshader|llvmpipe|softpipe|mesa|software/i.test(rendererName);
    return { supported: true, software };
  } catch {
    return { supported: false, software: false };
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const ICON_SOUND_ON = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8v4h3.2l4.3 3.5V4.5L6.7 8H3.5Z"/><path d="M13.8 7.2a4.2 4.2 0 0 1 0 5.6"/><path d="M16 5.2a7 7 0 0 1 0 9.6"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8v4h3.2l4.3 3.5V4.5L6.7 8H3.5Z"/><path d="M14 7.5 17.5 12.5M17.5 7.5 14 12.5"/></svg>`;

/**
 * Mounts The Living Heart directly as an intro component on the landing page,
 * displays its live cardiac beat briefly with soft synchronized heartbeat audio,
 * then dissolves cleanly to reveal the landing page and disposes WebGL + audio resources.
 */
export function mountHeartIntro({ container, onReveal, onComplete } = {}) {
  if (!container) {
    onReveal?.();
    onComplete?.();
    return { skip: () => {}, destroy: () => {} };
  }

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const HOLD_DURATION_MS = prefersReducedMotion ? 1100 : 3200;
  const DISSOLVE_DURATION_MS = prefersReducedMotion ? 320 : 900;

  // Build intro DOM fresh inside container
  container.hidden = false;
  container.className = 'heart-intro is-entering';
  container.setAttribute('aria-hidden', 'false');
  container.innerHTML = `
    <div class="heart-intro-glow" aria-hidden="true"></div>
    <canvas class="heart-intro-canvas" aria-hidden="true"></canvas>
    <div class="heart-intro-hud">
      <div class="heart-intro-brand">
        <svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
          <g fill="none" stroke="#92d6bd" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
            <path d="M24 5 41 14.5v19L24 43 7 33.5v-19Z"/>
            <path d="M7 14.5 24 24l17-9.5M24 24v19"/>
          </g>
          <circle cx="24" cy="24" r="3.2" fill="#c7ef7a" stroke="#92d6bd" stroke-width="1.6"/>
        </svg>
        <span>3Dviz Pro Max</span>
      </div>
      <div class="heart-intro-actions">
        <button type="button" class="heart-intro-boost" id="heart-intro-boost" title="Trigger 1s heartbeat surge (B)">
          <span>Boost Beat</span>
          <kbd>B</kbd>
        </button>
        <button type="button" class="heart-intro-sound" id="heart-intro-sound" aria-pressed="true" title="Toggle heartbeat sound (M)">
          <span class="heart-intro-sound-icon">${ICON_SOUND_ON}</span>
          <span class="heart-intro-sound-label">Sound: On</span>
        </button>
        <button type="button" class="heart-intro-skip" id="heart-intro-skip">
          Skip intro
        </button>
      </div>
    </div>
    <div class="heart-intro-caption">
      <p class="heart-intro-kicker">01 / THE LIVING BODY · LIVE THREE.JS PRELUDE</p>
      <h2 class="heart-intro-title">The Living Heart</h2>
      <p class="heart-intro-status" id="heart-intro-status">Loading 15 BodyParts3D cardiac structures…</p>
      <div class="heart-intro-track" aria-hidden="true">
        <div class="heart-intro-bar" id="heart-intro-bar"></div>
      </div>
    </div>
  `;

  document.body.classList.add('intro-locked');

  const glowEl = container.querySelector('.heart-intro-glow');
  const canvas = container.querySelector('.heart-intro-canvas');
  const statusEl = container.querySelector('#heart-intro-status');
  const barEl = container.querySelector('#heart-intro-bar');
  const skipBtn = container.querySelector('#heart-intro-skip');
  const boostBtn = container.querySelector('#heart-intro-boost');
  const soundBtn = container.querySelector('#heart-intro-sound');
  const soundIconEl = soundBtn?.querySelector('.heart-intro-sound-icon');
  const soundLabelEl = soundBtn?.querySelector('.heart-intro-sound-label');

  let disposed = false;
  let rafId = null;
  let safetyTimer = null;
  let phase = 'loading'; // 'loading' | 'beating' | 'dissolving' | 'done'
  let beatStartTime = 0;
  let dissolveStartTime = 0;
  let lastFrameTime = 0;
  let audioCyclePhase = 0.14;
  let lubGlow = 0;
  let dubGlow = 0;
  let boostGlow = 0;
  let scriptedBoostFired = false;

  function crossedPhase(prev, curr, target) {
    return prev <= curr ? prev < target && curr >= target : prev < target || curr >= target;
  }

  function updateGlow(dt, fadeMultiplier = 1) {
    if (!glowEl) return;
    if (prefersReducedMotion) {
      glowEl.style.opacity = (0.28 * fadeMultiplier).toFixed(3);
      glowEl.style.transform = 'scale(1)';
      return;
    }
    lubGlow *= Math.exp(-dt * 7.0);
    dubGlow *= Math.exp(-dt * 9.0);
    boostGlow *= Math.exp(-dt * 2.4);
    const boostLift = 1 + boostGlow * 0.28;
    const pulse = Math.min(1, (lubGlow * 0.85 + dubGlow * 0.58) * boostLift);
    const opacity = (0.2 + pulse * 0.76) * fadeMultiplier;
    const scale = 0.94 + pulse * 0.16;
    glowEl.style.opacity = opacity.toFixed(3);
    glowEl.style.transform = `scale(${scale.toFixed(4)})`;
  }

  let renderer = null;
  let studio = null;
  let heartResult = null;
  let scene = null;
  let camera = null;
  const fadeMaterials = [];

  const glCaps = detectSoftwareWebGL();

  function updateSoundButton({ muted, suspended, boosted = false }) {
    if (!soundBtn) return;
    if (!heartbeatAudio.isSupported) {
      soundBtn.hidden = true;
      if (boostBtn) boostBtn.hidden = true;
      return;
    }
    const active = !muted && !suspended;
    soundBtn.setAttribute('aria-pressed', String(active));
    soundBtn.classList.toggle('is-prompting', !muted && suspended);
    if (soundIconEl) {
      soundIconEl.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    }
    if (soundLabelEl) {
      soundLabelEl.textContent = muted
        ? 'Sound: Off'
        : suspended
          ? 'Tap for Audio'
          : 'Sound: On';
    }
    if (boostBtn) {
      boostBtn.classList.toggle('is-boosted', Boolean(boosted));
      boostBtn.hidden = muted;
    }
    if (statusEl && phase === 'beating' && !prefersReducedMotion) {
      statusEl.textContent =
        !muted && suspended
          ? 'Click anywhere for boom-boom audio · dissolving into site…'
          : boosted
            ? 'Peak cardiac beat · boom-boom boost active…'
            : 'Cardiac cycle live · dissolving into landing page…';
    }
  }

  const heartbeatAudio = createHeartbeatAudio({
    onStateChange: updateSoundButton,
    onBoostChange: (isBoosted) => {
      if (isBoosted) boostGlow = 1;
    },
  });
  updateSoundButton({
    muted: heartbeatAudio.isMuted(),
    suspended: heartbeatAudio.isSuspended(),
    boosted: heartbeatAudio.isBoosted(),
  });

  async function fireImpactBoost({ immediateBoom = false } = {}) {
    if (disposed || phase === 'dissolving' || phase === 'done') return;
    const wasSuspended = heartbeatAudio.isSuspended();
    if (wasSuspended) {
      await heartbeatAudio.unlock();
    }
    if (heartbeatAudio.isMuted()) {
      await heartbeatAudio.toggleMute();
    }
    boostGlow = 1;
    if (immediateBoom || wasSuspended) {
      lubGlow = 1;
      window.setTimeout(() => {
        if (!disposed) dubGlow = 0.72;
      }, 240);
      heartbeatAudio.playBoomBoom({ boost: true });
    } else {
      heartbeatAudio.triggerBoost(1.15);
    }
  }

  function onContainerPointerDown(e) {
    if (disposed || phase === 'dissolving' || phase === 'done') return;
    if (
      e.target instanceof Element &&
      e.target.closest('#heart-intro-skip, #heart-intro-sound, #heart-intro-boost')
    ) {
      return;
    }
    if (heartbeatAudio.isSuspended()) {
      fireImpactBoost({ immediateBoom: true });
    }
  }

  boostBtn?.addEventListener('click', () => {
    fireImpactBoost({ immediateBoom: true });
  });
  soundBtn?.addEventListener('click', () => {
    heartbeatAudio.toggleMute();
  });
  container.addEventListener('pointerdown', onContainerPointerDown);

  function cleanup() {
    if (disposed) return;
    disposed = true;
    phase = 'done';

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }

    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    container.removeEventListener('pointerdown', onContainerPointerDown);

    heartbeatAudio.dispose();

    if (heartResult?.group) {
      disposeGroup(heartResult.group);
    }
    heartResult?.dispose?.();
    studio?.dispose?.();
    renderer?.dispose?.();

    fadeMaterials.length = 0;
    heartResult = null;
    studio = null;
    renderer = null;
    scene = null;
    camera = null;

    document.body.classList.remove('intro-locked');
    container.classList.remove('is-entering', 'is-ready', 'is-dissolving');
    container.setAttribute('aria-hidden', 'true');
    container.hidden = true;
    container.innerHTML = '';

    onComplete?.();
  }

  function beginDissolve() {
    if (disposed || phase === 'dissolving' || phase === 'done') return;
    phase = 'dissolving';
    dissolveStartTime = performance.now();

    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }

    heartbeatAudio.fadeOut(DISSOLVE_DURATION_MS / 1000);

    if (statusEl) {
      statusEl.textContent = 'Opening 3Dviz Pro Max…';
    }
    if (barEl) {
      barEl.style.transform = 'scaleX(1)';
    }

    // Prepare materials for smooth 3D opacity dissolve
    for (const mat of fadeMaterials) {
      mat.transparent = true;
      mat.needsUpdate = true;
    }

    container.classList.add('is-dissolving');
    onReveal?.();

    // If WebGL wasn't mounted yet (still loading or unsupported), complete on CSS timing
    if (!renderer || !scene || !camera || !heartResult) {
      window.setTimeout(cleanup, DISSOLVE_DURATION_MS);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'b' || e.key === 'B') {
      if (phase === 'loading' || phase === 'beating') {
        e.preventDefault();
        fireImpactBoost({ immediateBoom: true });
      }
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      if (phase === 'loading' || phase === 'beating') {
        e.preventDefault();
        heartbeatAudio.toggleMute();
      }
      return;
    }
    if (
      (e.target === soundBtn || e.target === boostBtn) &&
      (e.key === 'Enter' || e.key === ' ')
    ) {
      return;
    }
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      if (phase === 'loading' || phase === 'beating') {
        e.preventDefault();
        beginDissolve();
      }
    }
  }

  skipBtn?.addEventListener('click', beginDissolve);
  window.addEventListener('keydown', onKeyDown);

  function onResize() {
    if (!renderer || !camera) return;
    const w = container.clientWidth || window.innerWidth || 1280;
    const h = container.clientHeight || window.innerHeight || 720;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  if (!glCaps.supported) {
    if (statusEl) statusEl.textContent = 'WebGL unavailable — opening landing page…';
    window.setTimeout(beginDissolve, 450);
    return { skip: beginDissolve, destroy: cleanup };
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !glCaps.software,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    window.setTimeout(beginDissolve, 350);
    return { skip: beginDissolve, destroy: cleanup };
  }

  renderer.setPixelRatio(glCaps.software ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = !glCaps.software;
  if (!glCaps.software) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  scene = new THREE.Scene();
  const w0 = container.clientWidth || window.innerWidth || 1280;
  const h0 = container.clientHeight || window.innerHeight || 720;
  camera = new THREE.PerspectiveCamera(36, w0 / Math.max(1, h0), 0.05, 100);
  camera.position.set(2.35, 0.95, 8.55);
  camera.lookAt(-0.25, 0.05, 0);
  renderer.setSize(w0, h0, false);

  studio = createStudioRig(scene, renderer, {
    subject: [0, 0, 0],
    environmentIntensity: 0.25,
  });
  studio.key.intensity = 9;
  studio.fill.intensity = 3;
  studio.rim.intensity = 9;
  if (glCaps.software) {
    studio.contact.castShadow = false;
  }

  window.addEventListener('resize', onResize);

  // Guard against slow network / missing asset hang so the landing page is never blocked
  safetyTimer = window.setTimeout(() => {
    if (!disposed && phase === 'loading') {
      beginDissolve();
    }
  }, 8000);

  function renderFrame(now) {
    if (disposed) return;

    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = now;

    if (heartResult) {
      if (phase === 'beating') {
        const elapsed = now - beatStartTime;
        const progress = Math.min(1, elapsed / HOLD_DURATION_MS);

        if (barEl) {
          barEl.style.transform = `scaleX(${progress.toFixed(4)})`;
        }

        // Advance cardiac beat (72 BPM during intro) and sync boom-boom audio + glow
        const beatStep = prefersReducedMotion ? 0 : dt * 1.2;
        heartResult.update(beatStep);
        const prevPhase = audioCyclePhase;
        audioCyclePhase = (audioCyclePhase + (prefersReducedMotion ? dt * 1.0 : beatStep)) % 1;
        if (crossedPhase(prevPhase, audioCyclePhase, 0.17)) lubGlow = 1;
        if (crossedPhase(prevPhase, audioCyclePhase, 0.48)) dubGlow = 0.72;

        // Scripted ~1.15s peak boom-boom surge right on the hero middle beat before dissolving
        if (!scriptedBoostFired && !prefersReducedMotion && elapsed >= 680) {
          scriptedBoostFired = true;
          heartbeatAudio.triggerBoost(1.15);
          boostGlow = 1;
        }

        heartbeatAudio.syncPhase(audioCyclePhase);
        updateGlow(dt, 1);

        // Gentle orbital drift + subtle push-in while heart beats
        const drift = prefersReducedMotion ? 0 : easeOutCubic(progress);
        const angle = -0.14 + drift * 0.34;
        const radius = 8.45 - drift * 0.9;
        camera.position.set(
          Math.sin(angle) * radius + 1.45,
          0.95 - drift * 0.18,
          Math.cos(angle) * radius
        );
        camera.lookAt(-0.22 + drift * 0.14, 0.05, 0);

        if (elapsed >= HOLD_DURATION_MS) {
          beginDissolve();
        }
      } else if (phase === 'dissolving') {
        const dElapsed = now - dissolveStartTime;
        const dProgress = Math.min(1, dElapsed / DISSOLVE_DURATION_MS);
        const eased = easeInOutCubic(dProgress);
        const remaining = 1 - eased;

        const fadeStep = prefersReducedMotion ? 0 : dt * 0.8;
        heartResult.update(fadeStep);
        const prevPhase = audioCyclePhase;
        audioCyclePhase = (audioCyclePhase + fadeStep) % 1;
        if (crossedPhase(prevPhase, audioCyclePhase, 0.17)) lubGlow = 1;
        if (crossedPhase(prevPhase, audioCyclePhase, 0.48)) dubGlow = 0.72;
        heartbeatAudio.syncPhase(audioCyclePhase);
        updateGlow(dt, remaining);

        // Dissolve 3D heart opacity & gently expand/recede as landing page emerges
        for (const mat of fadeMaterials) {
          const baseOpacity = mat.userData._baseOpacity ?? 1;
          mat.opacity = baseOpacity * remaining;
        }
        const scale = 1 + eased * 0.06;
        heartResult.group.scale.setScalar(scale);
        camera.position.z -= dt * 0.45;
        camera.lookAt(-0.1, 0.05, 0);

        renderer.render(scene, camera);

        if (dProgress >= 1) {
          cleanup();
          return;
        }
      }

      if (phase !== 'dissolving') {
        renderer.render(scene, camera);
      }
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  createScene()
    .then((result) => {
      if (disposed) {
        disposeGroup(result.group);
        result.dispose?.();
        return;
      }

      if (safetyTimer !== null) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }

      heartResult = result;
      scene.add(result.group);

      // Record original material opacities for crisp dissolve fade
      result.group.traverse((obj) => {
        const mats = [obj.material].flat().filter(Boolean);
        for (const m of mats) {
          if (m.userData._baseOpacity === undefined) {
            m.userData._baseOpacity = typeof m.opacity === 'number' ? m.opacity : 1;
          }
          fadeMaterials.push(m);
        }
      });

      // Start just before ventricular systole (phase 0.14) so the first lub-dub aligns cleanly
      audioCyclePhase = 0.14;
      result.update(0.14);
      heartbeatAudio.syncPhase(audioCyclePhase);
      renderer.render(scene, camera);

      if (phase === 'dissolving') {
        // User skipped while assets were still loading
        window.setTimeout(cleanup, 250);
        return;
      }

      phase = 'beating';
      beatStartTime = performance.now();
      lastFrameTime = beatStartTime;
      container.classList.add('is-ready');

      if (statusEl) {
        statusEl.textContent = prefersReducedMotion
          ? '15 registered anatomical parts · opening landing page…'
          : !heartbeatAudio.isMuted() && heartbeatAudio.isSuspended()
            ? 'Click anywhere for boom-boom audio · dissolving into site…'
            : 'Cardiac cycle live · dissolving into landing page…';
      }

      rafId = requestAnimationFrame(renderFrame);
    })
    .catch(() => {
      if (!disposed) {
        beginDissolve();
      }
    });

  return {
    skip: beginDissolve,
    triggerBoost: () => fireImpactBoost({ immediateBoom: true }),
    destroy: cleanup,
  };
}
