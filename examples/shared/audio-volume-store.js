/**
 * Global synchronized volume store for the "boom-boom" cardiac audio pulse.
 *
 * Persists only a single numeric scalar [0, 1] in localStorage (zero PHI/PII)
 * and synchronizes across:
 *  - All active createHeartbeatAudio() instances in the same document
 *  - Embedded study preview iframes and standalone /heart/ tabs via `storage` events
 */

export const VOLUME_STORAGE_KEY = '3dviz:pulse-volume';
export const DEFAULT_PULSE_VOLUME = 0.75;

const listeners = new Set();
let storageBound = false;

export function clampVolume(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_PULSE_VOLUME;
  return Math.round(Math.max(0, Math.min(1, num)) * 100) / 100;
}

/**
 * Perceptual loudness curve so quiet study levels (10%–35%) feel gentle and
 * controlled while 100% delivers full punch.
 */
export function volumeToGain(volume) {
  const v = clampVolume(volume);
  if (v <= 0) return 0;
  return Math.pow(v, 1.45);
}

function readPersistedVolume() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_PULSE_VOLUME;
    }
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null || raw === '') return DEFAULT_PULSE_VOLUME;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_PULSE_VOLUME;
    return clampVolume(parsed);
  } catch {
    return DEFAULT_PULSE_VOLUME;
  }
}

function writePersistedVolume(vol) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(vol));
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

let currentVolume = readPersistedVolume();
let lastNonZeroVolume = currentVolume > 0 ? currentVolume : DEFAULT_PULSE_VOLUME;

function getSnapshot() {
  return {
    volume: currentVolume,
    percent: Math.round(currentVolume * 100),
    muted: currentVolume <= 0,
    gain: volumeToGain(currentVolume),
  };
}

function emit() {
  const snap = getSnapshot();
  for (const listener of listeners) {
    try {
      listener(snap);
    } catch {
      // Isolate subscriber errors so other audio engines still update
    }
  }
}

function bindStorageListener() {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== VOLUME_STORAGE_KEY) return;
    const next =
      event.newValue === null || event.newValue === ''
        ? DEFAULT_PULSE_VOLUME
        : clampVolume(Number(event.newValue));
    if (next === currentVolume) return;
    currentVolume = next;
    if (next > 0) lastNonZeroVolume = next;
    emit();
  });
}

export function getGlobalPulseVolume() {
  return currentVolume;
}

export function getGlobalPulseSnapshot() {
  return getSnapshot();
}

export function getLastNonZeroVolume() {
  return lastNonZeroVolume;
}

export function setGlobalPulseVolume(value, { persist = true } = {}) {
  const next = clampVolume(value);
  if (next > 0) {
    lastNonZeroVolume = next;
  }
  const changed = next !== currentVolume;
  currentVolume = next;
  if (persist) {
    writePersistedVolume(next);
  }
  if (changed) {
    emit();
  }
  return getSnapshot();
}

export function nudgeGlobalPulseVolume(delta) {
  return setGlobalPulseVolume(currentVolume + Number(delta || 0));
}

export function toggleGlobalPulseMute() {
  if (currentVolume > 0) {
    return setGlobalPulseVolume(0);
  }
  const restore = lastNonZeroVolume > 0 ? lastNonZeroVolume : DEFAULT_PULSE_VOLUME;
  return setGlobalPulseVolume(restore);
}

export function subscribeGlobalPulseVolume(listener) {
  if (typeof listener !== 'function') return () => {};
  bindStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
