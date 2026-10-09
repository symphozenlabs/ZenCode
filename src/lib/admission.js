/**
 * Admission numbers for the 2025 and 2026 MCA batches: 25CAPMCA001, 26capmca123 …
 * Either case is accepted; values are stored in capitals.
 * Keep in sync with the admission check in firestore.rules.
 */
export const ADMISSION_PATTERN = /^(25|26)CAPMCA\d{3}$/i;

export const ADMISSION_HINT = 'Use the format 25CAPMCA001 or 26CAPMCA001.';

/** @param {string} value */
export function normalizeAdmission(value) {
  return (value || '').trim().toUpperCase();
}

/** @param {string} value */
export function isValidAdmission(value) {
  return ADMISSION_PATTERN.test((value || '').trim());
}

/** Batch prefix → year of study for the 2026 event. */
const YEAR_BY_BATCH = {
  '25': 'PG 2nd Year',
  '26': 'PG 1st Year'
};

/**
 * Year of study implied by the admission number's batch prefix, or '' when
 * it doesn't start with a known batch yet.
 * @param {string} value
 */
export function yearFromAdmission(value) {
  return YEAR_BY_BATCH[(value || '').trim().slice(0, 2)] || '';
}

// Allowed characters at each position of 2[56]CAPMCA###.
const ADMISSION_SLOTS = ['2', '56', 'C', 'A', 'P', 'M', 'C', 'A', '0123456789', '0123456789', '0123456789'];

/**
 * Live status while typing:
 * 'empty' | 'partial' (could still become valid) | 'valid' | 'invalid'.
 * @param {string} value
 */
export function admissionStatus(value) {
  const v = (value || '').trim().toUpperCase();
  if (!v) return 'empty';
  if (v.length > ADMISSION_SLOTS.length) return 'invalid';
  for (let i = 0; i < v.length; i++) {
    if (!ADMISSION_SLOTS[i].includes(v[i])) return 'invalid';
  }
  return v.length === ADMISSION_SLOTS.length ? 'valid' : 'partial';
}
