import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FakeRunner } from '../src/runner.ts';
import { runScan } from '../src/scan.ts';
import { runApply } from '../src/apply.ts';
import { scrubProse, findBrandLeak } from '../src/mask.ts';
import type { ApplyError, ApplyResult } from '../src/schemas.ts';

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-mcp-'));
}

function makeSnowflakeRepo(): string {
  const repo = tmpRepo();
  const runDir = path.join(repo, '.snowflake', 'projects', 'run1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'state.json'),
    JSON.stringify({ conversionLevel: 'page-level', templateName: 'test-2', pageSlug: 'test-2' }),
  );
  return repo;
}

const SCAN_CANNED = JSON.stringify({
  page: 'test-2',
  findings: [
    {
      page: 'test-2',
      source: 'impeccable',
      score: { value: 11, max: 20 },
      findings: [
        {
          id: 'contrast-kicker',
          severity: 'P1',
          category: 'accessibility',
          location: '.kicker',
          recommendation: 'Accent green on light bg is 2.7:1; use an AA-safe token.',
          suggestedCommand: '/impeccable colorize',
        },
      ],
    },
  ],
});

const UNION = JSON.parse(SCAN_CANNED).findings;

test('autofix_scan returns a valid findings-contract payload and writes .audit/', async () => {
  const repo = tmpRepo();
  const runner = new FakeRunner([SCAN_CANNED]);
  const res = await runScan({ target: 'https://example.com/test-2', types: ['design'], repoPath: repo }, { runner });

  assert.equal(res.page, 'test-2');
  assert.equal(res.scores['design'].value, 11);
  assert.equal(res.scores['design'].max, 20);
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0].findings[0].id, 'contrast-kicker');
  assert.deepEqual(res.unavailable, []);

  // persisted to disk
  assert.ok(res.artifacts.findings);
  const onDisk = path.join(repo, res.artifacts.findings!);
  assert.ok(fs.existsSync(onDisk), 'findings.json written');
  assert.ok(res.artifacts.perValidator.some((p) => p.endsWith('design.json')), 'per-validator named by label');
  assert.ok(!res.artifacts.perValidator.some((p) => p.includes('impeccable')), 'no validator name in artifact filename');
});

test('autofix_scan lists requested-but-planned validators as unavailable, never fabricates them', async () => {
  const repo = tmpRepo();
  const runner = new FakeRunner([SCAN_CANNED]);
  const res = await runScan({ target: 'test-2', types: ['design', 'seo', 'llm-visibility'], repoPath: repo }, { runner });
  assert.deepEqual(res.unavailable.sort(), ['llm-visibility', 'seo']);
  // only the design source is present — nothing fabricated for seo/llm-visibility
  assert.deepEqual(Object.keys(res.scores), ['design']);
});

test('autofix_scan keeps source/suggestedCommand in payload but never surfaces them in scores', async () => {
  const repo = tmpRepo();
  const runner = new FakeRunner([SCAN_CANNED]);
  const res = await runScan({ target: 'test-2', types: ['design'], repoPath: repo, persist: false }, { runner });
  // source kept for apply routing
  assert.equal(res.findings[0].source, 'impeccable');
  assert.equal(res.findings[0].findings[0].suggestedCommand, '/impeccable colorize');
  // but the masked surface (scores keys) uses the public label
  assert.ok('design' in res.scores);
  assert.ok(!('impeccable' in res.scores));
});

test('autofix_apply dryRun:true returns a plan and edits nothing', async () => {
  const repo = makeSnowflakeRepo();
  const planJson = JSON.stringify({
    plan: [{ id: 'contrast-kicker', severity: 'P1', lane: 'AUTO', files: ['styles/test-2.css'], change: 'repoint kicker color to an AA token' }],
  });
  const runner = new FakeRunner([planJson]);
  const res = (await runApply({ findings: UNION, repoPath: repo, dryRun: true }, { runner })) as ApplyResult;

  assert.equal(res.adapter, 'EDS overlay');
  assert.equal(res.plan.length, 1);
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.proposed, []);
  assert.equal(res.remediationLog, null);
  // dry run prompt was used
  assert.match(runner.calls[0].prompt, /DRY RUN/);
  // no source files created/edited
  assert.ok(!fs.existsSync(path.join(repo, 'styles')), 'no edits on dry run');
});

test('autofix_apply against a repo with no matching adapter returns no_adapter', async () => {
  const repo = tmpRepo();
  const runner = new FakeRunner([]); // must NOT be consulted
  const res = (await runApply({ findings: UNION, repoPath: repo, dryRun: true }, { runner })) as ApplyError;
  assert.equal(res.error, 'no_adapter');
  assert.equal(runner.calls.length, 0, 'agent not called when no adapter matches');
});

test('mask: no validator/adapter brand names leak into apply output, real paths preserved', async () => {
  const repo = makeSnowflakeRepo();
  const leaky = JSON.stringify({
    plan: [{ id: 'f1', severity: 'P1', lane: 'ASSIST', files: ['styles/test-2.css'], change: 'delegate to impeccable' }],
    applied: [{ id: 'f1', lane: 'ASSIST', file: 'styles/test-2.css', change: 'applied design fix via impeccable', validation: 'stylelint ok', status: 'closed' }],
    proposed: [{ id: 'f2', lane: 'ARCH', task: 'wire snowflake-overlay imagery with real assets' }],
    deferred: [],
    score: { design: { before: 11, after: 16, delta: 5, max: 20, status: 'measured' } },
    remediationLog: '.snowflake/projects/run1/remediation.md',
  });
  const runner = new FakeRunner([leaky]);
  const res = (await runApply({ findings: UNION, repoPath: repo, dryRun: false }, { runner })) as ApplyResult;

  const surfaced = JSON.stringify({ adapter: res.adapter, plan: res.plan, applied: res.applied, proposed: res.proposed, score: res.score });
  assert.ok(!/impeccable/i.test(surfaced), 'no validator name leaks');
  assert.ok(!/(?<![./])snowflake\b(?!\/)/i.test(surfaced), 'no bare adapter/platform brand leaks');
  assert.equal(res.adapter, 'EDS overlay');
  // real path is factual — preserved exactly
  assert.equal(res.remediationLog, '.snowflake/projects/run1/remediation.md');
});

test('mask unit: scrubProse maps brands but preserves .snowflake/ paths', () => {
  assert.equal(scrubProse('delegate to impeccable'), 'delegate to design');
  assert.equal(scrubProse('the snowflake-overlay adapter'), 'the EDS overlay adapter');
  assert.equal(scrubProse('the snowflake adapter'), 'the the platform adapter');
  const withPath = 'wrote log to .snowflake/projects/run1/remediation.md';
  assert.equal(scrubProse(withPath), withPath, 'path untouched');
  assert.equal(findBrandLeak(withPath), null, 'path is not a leak');
  assert.ok(findBrandLeak('see impeccable audit'), 'bare brand is a leak');
});
