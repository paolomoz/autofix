// Branding mask — code-level enforcement on the way OUT.
//
// The skills already instruct the agent to mask; this module is the safety net the
// task requires: it (a) maps internal validator/adapter ids to public labels for fields
// WE control, (b) scrubs brand tokens out of agent-generated prose, and (c) asserts no
// brand token leaked. Real filesystem paths (e.g. `.snowflake/...`) are factual and are
// deliberately NOT scrubbed — the mask governs how we *name* things, not where files live.

export const VALIDATOR_LABELS: Record<string, string> = {
  impeccable: 'design',
  seo: 'SEO',
  'llm-visibility': 'LLM visibility',
  a11y: 'accessibility',
  perf: 'performance',
};

export const ADAPTER_LABELS: Record<string, string> = {
  'snowflake-overlay': 'EDS overlay',
  'canonical-eds': 'EDS',
  'universal-editor': 'Universal Editor',
  'generic-web': 'generic web',
};

/** Public label for a validator `source`; unmapped → finding `category` → generic. */
export function validatorLabel(source: string | undefined, category?: string): string {
  if (source && VALIDATOR_LABELS[source]) return VALIDATOR_LABELS[source];
  if (category) return category;
  return 'quality';
}

/** Public label for an adapter id; unmapped → generic "platform". */
export function adapterLabel(adapterId: string | undefined): string {
  if (adapterId && ADAPTER_LABELS[adapterId]) return ADAPTER_LABELS[adapterId];
  return 'platform';
}

// Replace brand tokens in a PROSE string with public labels.
// Order matters: commands and hyphenated names first, then bare brand words.
// `.snowflake/...` path segments are preserved (lookbehind on `.`/`/`, lookahead on `/`).
export function scrubProse(s: string): string {
  if (typeof s !== 'string') return s;
  return s
    // `/impeccable colorize` and friends → neutral phrasing
    .replace(/\/impeccable\b[^\s`)]*/gi, 'the design validator')
    .replace(/\bimpeccable\b/gi, 'design')
    .replace(/\bsnowflake-overlay\b/gi, 'EDS overlay')
    // bare "snowflake" that is NOT part of a `.snowflake/` path → "the platform"
    .replace(/(?<![./\w-])snowflake\b(?!\/|-overlay)/gi, 'the platform');
}

// Tokens that must never appear in surfaced prose AFTER scrubbing.
// `snowflake` is allowed only inside a path (preceded by `.`/`/`, or followed by `/`).
const LEAK_PATTERNS: RegExp[] = [
  /\bimpeccable\b/i,
  /(?<![./])\bsnowflake\b(?!\/)/i,
];

export function findBrandLeak(s: string): string | null {
  if (typeof s !== 'string') return null;
  for (const re of LEAK_PATTERNS) {
    const m = s.match(re);
    if (m) return m[0];
  }
  return null;
}

export class BrandLeakError extends Error {}

/**
 * Walk a result object scrubbing only the designated PROSE fields, then assert no leak.
 * `prosePaths` are dot/bracket-free field names whose string values are surfaced text.
 * Anything not listed (findings payload `source`/`suggestedCommand`, file paths,
 * remediationLog) is left untouched — by design.
 */
export function maskProseFields<T>(result: T, proseFieldNames: Set<string>): T {
  const scrubWalk = (node: unknown, keyHint?: string): unknown => {
    if (typeof node === 'string') {
      return keyHint && proseFieldNames.has(keyHint) ? scrubProse(node) : node;
    }
    if (Array.isArray(node)) return node.map((v) => scrubWalk(v, keyHint));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = scrubWalk(v, k);
      }
      return out;
    }
    return node;
  };
  const scrubbed = scrubWalk(result) as T;

  // Assert: no leak remains in the designated prose fields.
  const assertWalk = (node: unknown, keyHint?: string): void => {
    if (typeof node === 'string') {
      if (keyHint && proseFieldNames.has(keyHint)) {
        const leak = findBrandLeak(node);
        if (leak) throw new BrandLeakError(`brand token "${leak}" leaked into field "${keyHint}": ${node}`);
      }
      return;
    }
    if (Array.isArray(node)) { node.forEach((v) => assertWalk(v, keyHint)); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) assertWalk(v, k);
    }
  };
  assertWalk(scrubbed);
  return scrubbed;
}

// The prose fields per tool (everything else — paths, source, suggestedCommand — is exempt).
export const SCAN_PROSE_FIELDS = new Set<string>(['recommendation', 'evidence']);
export const APPLY_PROSE_FIELDS = new Set<string>([
  'adapter', 'change', 'validation', 'task', 'reason', 'message',
]);
