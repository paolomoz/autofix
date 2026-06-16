import { scanSkill, applySkill, findingsContract, adapterContract } from './skills.ts';

// Each prompt embeds the real SKILL.md + contracts so the agent FOLLOWS the skill (not a
// reimplementation), then constrains the final answer to strict JSON. The handler parses,
// masks, and schema-validates the result — so the JSON contract here is belt-and-suspenders.

const JSON_ONLY =
  'CRITICAL OUTPUT RULE: your FINAL message must be ONLY a single JSON value matching the schema ' +
  'below — no prose, no explanation, no markdown code fences. Do not narrate. Emit JSON only.';

export function buildScanPrompt(args: {
  target: string;
  builtTypes: string[];
  unavailable: string[];
  repoPath: string;
}): string {
  return [
    '# Task: run the `scan` skill and return JSON',
    '',
    'You are the `scan` skill. Follow it EXACTLY. Here is the skill:',
    '', '<scan-skill>', scanSkill(), '</scan-skill>',
    '', 'And the findings contract it normalizes to:',
    '', '<findings-contract>', findingsContract(), '</findings-contract>',
    '',
    `Target to audit: ${args.target}`,
    `Repo root for context: ${args.repoPath}`,
    `Run ONLY these built validator types: ${args.builtTypes.join(', ') || '(none)'}.`,
    `Do NOT fabricate findings for unavailable/planned types: ${args.unavailable.join(', ') || '(none)'}.`,
    'Always include each validator\'s `score` (the baseline). Use a real audit; never invent findings.',
    '',
    JSON_ONLY,
    'Schema: an object',
    '{',
    '  "page": string,',
    '  "findings": [ { "page": string, "source": string, "score": {"value": number|null, "max": number}, "findings": [ <finding-contract-object> ... ] } ... ]',
    '}',
    'where each <finding-contract-object> is { id, severity, category, location, recommendation, suggestedCommand?, evidence? }.',
    'Keep the real `source` (e.g. the validator id) and `suggestedCommand` inside the findings — the wrapper masks them on output.',
  ].join('\n');
}

export function buildApplyPrompt(args: {
  union: unknown;
  repoPath: string;
  lanes: string[];
  dryRun: boolean;
  commit: boolean;
  adapterId: string;
  adapterMarkdown: string;
}): string {
  const lanesNote = args.dryRun
    ? 'DRY RUN: produce the PLAN ONLY. Make NO edits, run NO validate, write NO remediation log.'
    : `Act on these lanes: ${args.lanes.join(', ')}. ARCH is always proposal-only. Skip lanes not listed (defer them).`;
  return [
    '# Task: run the `apply` skill and return JSON',
    '',
    'You are the `apply` skill. Follow it EXACTLY. Here is the skill:',
    '', '<apply-skill>', applySkill(), '</apply-skill>',
    '', 'The adapter contract:',
    '', '<adapter-contract>', adapterContract(), '</adapter-contract>',
    '', `The platform adapter to use (already detected — id "${args.adapterId}"):`,
    '', '<adapter>', args.adapterMarkdown, '</adapter>',
    '', 'The findings to remediate (union across validators):',
    '', '<findings>', JSON.stringify(args.union, null, 2), '</findings>',
    '',
    `Repo to remediate: ${args.repoPath}`,
    lanesNote,
    args.commit ? 'You MAY commit when done.' : 'Do NOT commit.',
    'Re-score from a REAL re-scan, never from counting closed findings; if you cannot re-scan, set "after" to null and status "unmeasured".',
    'If the validate toolchain is unavailable, mark status "applied-unverified" rather than claiming verification.',
    'Idempotent: skip findings already closed (keyed on finding.id).',
    '',
    JSON_ONLY,
    'Schema: an object',
    '{',
    '  "plan":     [ { "id": string, "severity": string, "lane": "AUTO"|"ASSIST"|"ARCH"|"SKIP", "files": string[], "change": string } ... ],',
    args.dryRun ? '' : '  "applied":  [ { "id": string, "lane": "AUTO"|"ASSIST", "file": string, "change": string, "validation": string, "status": "closed"|"residual"|"applied-unverified" } ... ],',
    args.dryRun ? '' : '  "proposed": [ { "id": string, "lane": "ARCH", "task": string } ... ],',
    args.dryRun ? '' : '  "deferred": [ { "id": string, "reason": string } ... ],',
    args.dryRun ? '' : '  "score":    { "<dimension-label>": { "before": number|null, "after": number|null, "delta": number|null, "max": number, "status": "measured"|"unmeasured" } },',
    args.dryRun ? '' : '  "remediationLog": string (the adapter-named path)',
    '}',
    'Use PUBLIC dimension labels in all prose (e.g. "design"); never name the validator or the platform brand. Real file paths stay accurate.',
  ].filter(Boolean).join('\n');
}

export function buildMarkdownMapPrompt(markdown: string): string {
  return [
    '# Task: map an audit markdown report to the findings contract',
    '',
    'Use the `scan` skill\'s markdown→contract mapping:',
    '', '<scan-skill>', scanSkill(), '</scan-skill>',
    '', '<findings-contract>', findingsContract(), '</findings-contract>',
    '', 'Map THIS audit markdown to the contract:',
    '', '<markdown>', markdown, '</markdown>',
    '',
    JSON_ONLY,
    'Schema: a union array [ { "page": string, "source": string, "score": {"value": number|null, "max": number}, "findings": [ <finding-contract-object> ... ] } ... ]',
  ].join('\n');
}
