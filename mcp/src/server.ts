#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { scanInputShape, applyInputShape } from './schemas.ts';
import { runScan } from './scan.ts';
import { runApply } from './apply.ts';
import { createRunner } from './runner.ts';

const runner = createRunner();

const server = new McpServer({ name: 'autofix', version: '0.1.0' });

server.registerTool(
  'autofix_scan',
  {
    title: 'autofix scan',
    description:
      'Audit a target (URL / page slug / repo path) for quality findings and emit them in the shared ' +
      'findings contract, with a per-dimension baseline score. Runs only built validators; lists ' +
      'requested-but-planned ones as unavailable. Does NOT apply fixes.',
    inputSchema: scanInputShape,
  },
  async (args) => {
    try {
      const result = await runScan(args, { runner });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  'autofix_apply',
  {
    title: 'autofix apply',
    description:
      'Apply the fixes from a quality audit to a real repo: detect the platform adapter, triage findings ' +
      'into AUTO/ASSIST/ARCH, apply safe fixes, validate, and re-score to report a before→after delta. ' +
      'dryRun:true returns the plan only. Returns {error:"no_adapter"} when no adapter matches.',
    inputSchema: applyInputShape,
  },
  async (args) => {
    try {
      const result = await runApply(args, { runner });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return errorResult(e);
    }
  },
);

function errorResult(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: 'tool_failed', message }) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
