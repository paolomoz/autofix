import fs from 'node:fs';
import path from 'node:path';
import { readAutofixFile } from './skills.ts';

// Adapter DETECTION is deterministic (a cheap file check) so it lives in code — this is what
// lets apply return `no_adapter` without spinning up the agent. Adapter APPLICATION (locate /
// triage / apply / validate) is agent-driven, using the adapter markdown as context.

export interface AdapterDef {
  id: string;
  label: string; // public, masked label
  markdownRel: string; // path to the adapter reference, relative to AUTOFIX_ROOT
  detect(repoPath: string): boolean;
}

function snowflakeOverlayDetect(repoPath: string): boolean {
  const base = path.join(repoPath, '.snowflake', 'projects');
  let runs: string[];
  try {
    runs = fs.readdirSync(base);
  } catch {
    return false;
  }
  for (const run of runs) {
    const statePath = path.join(base, run, 'state.json');
    try {
      const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (st && st.conversionLevel === 'page-level') return true;
    } catch {
      /* missing/invalid state.json for this run — keep looking */
    }
  }
  return false;
}

export const ADAPTERS: AdapterDef[] = [
  {
    id: 'snowflake-overlay',
    label: 'EDS overlay',
    markdownRel: 'skills/apply/adapters/snowflake-overlay.md',
    detect: snowflakeOverlayDetect,
  },
];

export function detectAdapter(repoPath: string): AdapterDef | null {
  return ADAPTERS.find((a) => a.detect(repoPath)) ?? null;
}

export function adapterMarkdown(def: AdapterDef): string {
  return readAutofixFile(def.markdownRel);
}
