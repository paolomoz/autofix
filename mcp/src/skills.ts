import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The autofix SKILL markdown lives in THIS repo (the parent of mcp/). The repo being
// remediated is a separate `repoPath` argument. Resolve skill text relative to this module,
// overridable via AUTOFIX_SKILLS_DIR (the dir that CONTAINS `skills/`).
const here = path.dirname(fileURLToPath(import.meta.url)); // mcp/src
export const AUTOFIX_ROOT = process.env.AUTOFIX_SKILLS_DIR
  ? path.resolve(process.env.AUTOFIX_SKILLS_DIR)
  : path.resolve(here, '..', '..');

export function readAutofixFile(rel: string): string {
  return fs.readFileSync(path.join(AUTOFIX_ROOT, rel), 'utf8');
}

export const scanSkill = () => readAutofixFile('skills/scan/SKILL.md');
export const applySkill = () => readAutofixFile('skills/apply/SKILL.md');
export const findingsContract = () => readAutofixFile('skills/apply/contracts/findings.md');
export const adapterContract = () => readAutofixFile('skills/apply/contracts/adapter.md');
