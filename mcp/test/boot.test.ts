import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, '..', 'src', 'server.ts');

test('server boots over stdio and exposes autofix_scan + autofix_apply', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
  const client = new Client({ name: 'smoke', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['autofix_apply', 'autofix_scan']);
    const scan = tools.find((t) => t.name === 'autofix_scan')!;
    assert.ok(scan.inputSchema.properties?.target, 'scan exposes target input');
  } finally {
    await client.close();
  }
});
