import { z } from 'zod';

// ---------- findings contract ----------

export const zScore = z
  .object({ value: z.number().nullable(), max: z.number().optional(), dimensions: z.record(z.string(), z.number()).optional() })
  .nullable();

export const zFinding = z
  .object({
    id: z.string(),
    severity: z.string().optional(),
    category: z.string().optional(),
    location: z.string().optional(),
    recommendation: z.string().optional(),
    suggestedCommand: z.string().optional(),
    evidence: z.string().optional(),
  })
  .catchall(z.unknown());

// One per-validator findings object (the unit; scan emits a union = array of these).
export const zFindingsObject = z
  .object({
    page: z.string().optional(),
    source: z.string().optional(),
    score: zScore.optional(),
    findings: z.array(zFinding),
  })
  .catchall(z.unknown());

export const zFindingsUnion = z.union([zFindingsObject, z.array(zFindingsObject)]);

// ---------- tool INPUT schemas (raw shapes for MCP registerTool) ----------

export const scanInputShape = {
  target: z.string().describe('URL, page slug, or repo path to audit'),
  types: z.array(z.string()).default(['design']).describe("validator types; only those with status 'built' run"),
  repoPath: z.string().optional().describe('repo root for context + persistence'),
  persist: z.boolean().default(true).describe('also write .audit/<page>/'),
} as const;

export const applyInputShape = {
  findings: z.any().describe('findings object | array(union) | {path} | {markdown}'),
  repoPath: z.string().describe('repo to remediate; adapter detect() runs here'),
  lanes: z.array(z.enum(['AUTO', 'ASSIST', 'ARCH'])).default(['AUTO', 'ASSIST']),
  dryRun: z.boolean().default(false).describe('plan only, no edits'),
  commit: z.boolean().default(false),
} as const;

export const zScanInput = z.object(scanInputShape);
export const zApplyInput = z.object(applyInputShape);

// ---------- tool OUTPUT schemas (validated before returning) ----------

export const zScanResult = z.object({
  page: z.string(),
  scores: z.record(
    z.string(),
    z.object({ value: z.number().nullable(), max: z.number().optional(), dimensions: z.record(z.string(), z.number()).optional() }),
  ),
  findings: z.array(zFindingsObject),
  unavailable: z.array(z.string()),
  artifacts: z.object({ findings: z.string().nullable(), perValidator: z.array(z.string()) }),
});

export const zPlanItem = z.object({
  id: z.string(),
  severity: z.string().default(''),
  lane: z.enum(['AUTO', 'ASSIST', 'ARCH', 'SKIP']),
  files: z.array(z.string()).default([]),
  change: z.string().default(''),
});

export const zAppliedItem = z.object({
  id: z.string(),
  lane: z.enum(['AUTO', 'ASSIST']),
  file: z.string().default(''),
  change: z.string().default(''),
  validation: z.string().default(''),
  status: z.enum(['closed', 'residual', 'applied-unverified']),
});

export const zProposedItem = z.object({ id: z.string(), lane: z.literal('ARCH'), task: z.string().default('') });
export const zDeferredItem = z.object({ id: z.string(), reason: z.string().default('') });

export const zScoreDelta = z.object({
  before: z.number().nullable(),
  after: z.number().nullable(),
  delta: z.number().nullable(),
  max: z.number().optional(),
  dimensions: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['measured', 'unmeasured']).optional(),
});

export const zApplyResult = z.object({
  adapter: z.string(),
  plan: z.array(zPlanItem),
  applied: z.array(zAppliedItem).default([]),
  proposed: z.array(zProposedItem).default([]),
  deferred: z.array(zDeferredItem).default([]),
  score: z.record(z.string(), zScoreDelta).default({}),
  remediationLog: z.string().nullable().default(null),
});

export const zApplyError = z.object({ error: z.string(), message: z.string() });

export type ScanResult = z.infer<typeof zScanResult>;
export type ApplyResult = z.infer<typeof zApplyResult>;
export type ApplyError = z.infer<typeof zApplyError>;
export type FindingsObject = z.infer<typeof zFindingsObject>;
