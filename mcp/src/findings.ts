import fs from 'node:fs';
import path from 'node:path';
import { zFindingsObject, type FindingsObject } from './schemas.ts';
import type { AgentRunner } from './runner.ts';
import { extractJson } from './runner.ts';
import { buildMarkdownMapPrompt } from './prompts.ts';

// Accepts: a findings object | an array (union) | { path } | { markdown }.
// Normalizes everything to a union = array of per-validator findings objects.
export async function loadFindings(
  input: unknown,
  repoPath: string,
  runner: AgentRunner,
): Promise<FindingsObject[]> {
  if (input == null) throw new Error('findings is required');

  // { path: "..." } → read JSON from disk (relative to repoPath)
  if (isPlainObject(input) && typeof (input as any).path === 'string') {
    const p = path.resolve(repoPath, (input as any).path);
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return normalizeUnion(raw);
  }

  // { markdown: "..." } → map to the findings contract via the agent (as the skill does)
  if (isPlainObject(input) && typeof (input as any).markdown === 'string') {
    const text = await runner.run(buildMarkdownMapPrompt((input as any).markdown), {
      permissionMode: 'plan',
      timeoutMs: 120_000,
    });
    return normalizeUnion(extractJson(text));
  }

  return normalizeUnion(input);
}

function normalizeUnion(raw: unknown): FindingsObject[] {
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: FindingsObject[] = [];
  for (const item of arr) {
    const parsed = zFindingsObject.safeParse(item);
    if (!parsed.success) {
      throw new Error(`invalid findings object: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    // keep the ORIGINAL object (avoid stripping unknown keys we want to preserve)
    out.push(item as FindingsObject);
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
