import {
  zApplyInput,
  zApplyResult,
  type ApplyResult,
  type ApplyError,
} from './schemas.ts';
import { adapterLabel, maskProseFields, APPLY_PROSE_FIELDS } from './mask.ts';
import { detectAdapter, adapterMarkdown } from './adapters.ts';
import { loadFindings } from './findings.ts';
import { buildApplyPrompt } from './prompts.ts';
import { extractJson, type AgentRunner } from './runner.ts';
import { withRetry } from './util.ts';

export interface ApplyDeps {
  runner: AgentRunner;
}

export async function runApply(rawArgs: unknown, deps: ApplyDeps): Promise<ApplyResult | ApplyError> {
  const args = zApplyInput.parse(rawArgs);

  // Adapter detection is deterministic — no agent needed to answer `no_adapter`.
  const adapter = detectAdapter(args.repoPath);
  if (!adapter) {
    return {
      error: 'no_adapter',
      message: `No platform adapter matched ${args.repoPath}. apply can't route fixes without one; not guessing paths.`,
    };
  }

  const union = await loadFindings(args.findings, args.repoPath, deps.runner);

  const prompt = buildApplyPrompt({
    union,
    repoPath: args.repoPath,
    lanes: args.lanes,
    dryRun: args.dryRun,
    commit: args.commit,
    adapterId: adapter.id,
    adapterMarkdown: adapterMarkdown(adapter),
  });

  const parsed = await withRetry(async () => {
    const text = await deps.runner.run(prompt, {
      cwd: args.repoPath,
      addDirs: [args.repoPath],
      // dryRun stays read-only (plan mode); a real apply needs to edit + run validate.
      permissionMode: args.dryRun ? 'plan' : 'bypassPermissions',
    });
    return extractJson<Record<string, unknown>>(text);
  });

  // Build the result from agent output, but OVERRIDE adapter with the masked label we control.
  const built: ApplyResult = {
    adapter: adapterLabel(adapter.id),
    plan: (parsed.plan as any[]) ?? [],
    applied: args.dryRun ? [] : ((parsed.applied as any[]) ?? []),
    proposed: args.dryRun ? [] : ((parsed.proposed as any[]) ?? []),
    deferred: args.dryRun ? [] : ((parsed.deferred as any[]) ?? []),
    score: args.dryRun ? {} : ((parsed.score as any) ?? {}),
    remediationLog: args.dryRun ? null : ((parsed.remediationLog as string) ?? null),
  };

  const masked = maskProseFields(built, APPLY_PROSE_FIELDS);
  return zApplyResult.parse(masked);
}
