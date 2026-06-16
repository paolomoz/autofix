import fs from 'node:fs';
import path from 'node:path';
import { validatorLabel } from './mask.ts';
import type { FindingsObject } from './schemas.ts';

/** Derive a page slug from a URL, slug, or repo path. */
export function pageSlug(target: string): string {
  let t = target.trim();
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      t = u.pathname;
    }
  } catch {
    /* not a URL — treat as path/slug */
  }
  const segs = t.split(/[/\\]/).filter(Boolean);
  const last = segs.length ? segs[segs.length - 1] : t;
  const slug = last.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-');
  return slug || 'page';
}

export interface PersistResult {
  findings: string | null;
  perValidator: string[];
}

/**
 * Write `.audit/<page>/findings.json` (the merged union apply consumes) and one
 * `.audit/<page>/<label>.json` per validator, named by PUBLIC label (mask), not validator name.
 */
export function persistScan(repoPath: string, page: string, union: FindingsObject[]): PersistResult {
  const dir = path.join(repoPath, '.audit', page);
  fs.mkdirSync(dir, { recursive: true });

  const findingsPath = path.join(dir, 'findings.json');
  fs.writeFileSync(findingsPath, JSON.stringify(union, null, 2));

  const perValidator: string[] = [];
  for (const obj of union) {
    const label = validatorLabel(obj.source, obj.findings?.[0]?.category)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const p = path.join(dir, `${label}.json`);
    fs.writeFileSync(p, JSON.stringify(obj, null, 2));
    perValidator.push(rel(repoPath, p));
  }
  return { findings: rel(repoPath, findingsPath), perValidator };
}

function rel(repoPath: string, p: string): string {
  return path.relative(repoPath, p) || p;
}
