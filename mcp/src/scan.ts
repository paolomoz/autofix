import { zScanInput, zScanResult, zFindingsObject, type ScanResult, type FindingsObject } from './schemas.ts';
import { validatorLabel, maskProseFields, SCAN_PROSE_FIELDS } from './mask.ts';
import { pageSlug, persistScan } from './persist.ts';
import { buildScanPrompt } from './prompts.ts';
import { extractJson, type AgentRunner } from './runner.ts';
import { withRetry } from './util.ts';

// Validator registry status (from skills/scan/SKILL.md). Only `built` types actually run.
const BUILT_TYPES = new Set(['design']);

export interface ScanDeps {
  runner: AgentRunner;
}

export async function runScan(rawArgs: unknown, deps: ScanDeps): Promise<ScanResult> {
  const args = zScanInput.parse(rawArgs);
  const repoPath = args.repoPath ?? process.cwd();

  const built = args.types.filter((t) => BUILT_TYPES.has(t));
  const unavailable = args.types.filter((t) => !BUILT_TYPES.has(t));

  let union: FindingsObject[] = [];
  let page = pageSlug(args.target);

  if (built.length > 0) {
    const prompt = buildScanPrompt({ target: args.target, builtTypes: built, unavailable, repoPath });
    const parsed = await withRetry(async () => {
      const text = await deps.runner.run(prompt, {
        cwd: repoPath,
        permissionMode: 'bypassPermissions',
        addDirs: [repoPath],
      });
      const obj = extractJson<{ page?: string; findings?: unknown }>(text);
      const rawUnion = Array.isArray(obj.findings) ? obj.findings : [obj];
      const u: FindingsObject[] = rawUnion.map((item) => {
        const r = zFindingsObject.safeParse(item);
        if (!r.success) throw new Error(`scan returned an invalid findings object: ${r.error.message}`);
        return item as FindingsObject;
      });
      return { page: obj.page, union: u };
    });
    if (parsed.page) page = pageSlug(parsed.page);
    union = parsed.union;
  }

  // Scores keyed by PUBLIC label (the baseline the user will see improve).
  const scores: ScanResult['scores'] = {};
  for (const obj of union) {
    const label = validatorLabel(obj.source, obj.findings?.[0]?.category);
    const s = obj.score ?? null;
    scores[label] = s
      ? { value: s.value ?? null, max: s.max, dimensions: (s as any).dimensions }
      : { value: null };
  }

  const artifacts =
    args.persist && union.length > 0
      ? persistScan(repoPath, page, union)
      : { findings: null, perValidator: [] as string[] };

  const result: ScanResult = { page, scores, findings: union, unavailable, artifacts };

  // Mask prose fields (findings `source`/`suggestedCommand` stay — not in the prose set), then validate.
  const masked = maskProseFields(result, SCAN_PROSE_FIELDS);
  return zScanResult.parse(masked);
}
