/**
 * Client-side HIPAA / PHI prevention and redaction boundary for prototype mode.
 * Ensures no real patient identifiers enter search queries, URL parameters,
 * or UI telemetry while facility authentication and RBAC are pending.
 */

export const REDACTED_BOUNDARY = Object.freeze({
  mode: 'SYNTHETIC_REDACTED',
  subjectTag: 'SYNTH-DEV-001 [REDACTED]',
  accessNotice: 'Redacted synthetic telemetry · Zero PHI ingestion · RBAC pending',
  allowedProfiles: ['baseline', 'stress', 'sleep-debt', 'tactical'],
  allowedLenses: ['all', 'injury', 'stress', 'recovery'],
});

const PHI_RULES = [
  {
    code: 'SSN',
    regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
  },
  {
    code: 'MRN',
    regex: /\b(?:mrn|medical\s*record|patient\s*id|chart\s*#?)[\s:#-]*[a-z0-9-]{4,}\b/gi,
  },
  {
    code: 'DOB',
    regex: /\b(?:dob|date\s*of\s*birth|birth\s*date)[\s:#-]*\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/gi,
  },
  {
    code: 'EMAIL',
    regex: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  },
  {
    code: 'PHONE',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  },
  {
    code: 'PATIENT_LABEL',
    regex: /\b(?:patient|diagnosis|hipaa|phi)[\s:#-]+[^\n,;]{2,}/gi,
  },
];

export function detectPhiPatterns(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return [];
  }
  const matches = [];
  for (const rule of PHI_RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(input)) {
      matches.push(rule.code);
    }
    rule.regex.lastIndex = 0;
  }
  return matches;
}

export function redactPhi(input) {
  if (typeof input !== 'string') {
    return { sanitized: '', blocked: false, reasons: [] };
  }
  const reasons = detectPhiPatterns(input);
  if (reasons.length === 0) {
    return { sanitized: input, blocked: false, reasons: [] };
  }
  let sanitized = input;
  for (const rule of PHI_RULES) {
    rule.regex.lastIndex = 0;
    sanitized = sanitized.replace(rule.regex, '');
    rule.regex.lastIndex = 0;
  }
  return {
    sanitized: sanitized.replace(/\s{2,}/g, ' ').trim(),
    blocked: true,
    reasons,
  };
}

/**
 * Strict allowlist parser for URL query parameters so arbitrary or sensitive
 * query strings are never propagated into 3D scenes or UI state.
 */
export function parseSafeQuery(search = '') {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const rawProfile = (params.get('profile') || '').toLowerCase();
  const rawLens = (params.get('lens') || '').toLowerCase();

  return {
    skipIntro: params.get('skipIntro') === '1',
    embed: params.get('embed') === '1',
    plate: params.get('plate') === '1',
    profile: REDACTED_BOUNDARY.allowedProfiles.includes(rawProfile) ? rawProfile : null,
    lens: REDACTED_BOUNDARY.allowedLenses.includes(rawLens) ? rawLens : 'all',
  };
}
