import { spawn } from 'node:child_process';

// The agent boundary. Production wraps the authenticated `claude` CLI (default) or the
// Agent SDK; tests inject a FakeRunner. Everything else in the server is deterministic glue.

export interface AgentRunOpts {
  cwd?: string;
  model?: string;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowedTools?: string[];
  addDirs?: string[];
  timeoutMs?: number;
}

export interface AgentRunner {
  run(prompt: string, opts?: AgentRunOpts): Promise<string>;
}

const DEFAULT_MODEL = process.env.AUTOFIX_MODEL || 'claude-opus-4-8';
const DEFAULT_TIMEOUT = Number(process.env.AUTOFIX_AGENT_TIMEOUT_MS || 600_000);

/** Default runner: shell out to the authenticated `claude` CLI in headless JSON mode. */
export class CliRunner implements AgentRunner {
  private bin: string;
  constructor(bin = process.env.AUTOFIX_CLAUDE_BIN || 'claude') {
    this.bin = bin;
  }

  run(prompt: string, opts: AgentRunOpts = {}): Promise<string> {
    const args = ['-p', '--output-format', 'json', '--model', opts.model || DEFAULT_MODEL];
    const mode = opts.permissionMode || (process.env.AUTOFIX_PERMISSION_MODE as AgentRunOpts['permissionMode']);
    if (mode) args.push('--permission-mode', mode);
    if (opts.allowedTools?.length) args.push('--allowedTools', opts.allowedTools.join(','));
    for (const d of opts.addDirs || []) args.push('--add-dir', d);

    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`agent CLI timed out after ${opts.timeoutMs || DEFAULT_TIMEOUT}ms`));
      }, opts.timeoutMs || DEFAULT_TIMEOUT);

      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (err += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new Error(`failed to spawn "${this.bin}": ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`agent CLI exited ${code}: ${err.slice(0, 500)}`));
        // `--output-format json` → { type:'result', result:'<text>', ... }
        try {
          const parsed = JSON.parse(out);
          resolve(typeof parsed?.result === 'string' ? parsed.result : out);
        } catch {
          resolve(out);
        }
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}

/** Alternative runner: Claude Agent SDK (needs ANTHROPIC_API_KEY). Lazy-loaded. */
export class SdkRunner implements AgentRunner {
  async run(prompt: string, opts: AgentRunOpts = {}): Promise<string> {
    let mod: any;
    try {
      mod = await import('@anthropic-ai/claude-agent-sdk');
    } catch {
      throw new Error('AUTOFIX_AGENT=sdk but @anthropic-ai/claude-agent-sdk is not installed');
    }
    const iterator = mod.query({
      prompt,
      options: {
        model: opts.model || DEFAULT_MODEL,
        cwd: opts.cwd,
        permissionMode: opts.permissionMode,
        allowedTools: opts.allowedTools,
      },
    });
    let text = '';
    for await (const msg of iterator) {
      if (msg?.type === 'result' && typeof msg.result === 'string') text = msg.result;
    }
    return text;
  }
}

/** Test runner: returns canned responses in order (or by a matcher fn). */
export class FakeRunner implements AgentRunner {
  private queue: string[];
  public calls: { prompt: string; opts?: AgentRunOpts }[] = [];
  constructor(responses: string[] | ((prompt: string) => string)) {
    this.queue = Array.isArray(responses) ? [...responses] : [];
    if (!Array.isArray(responses)) this.matcher = responses;
  }
  private matcher?: (prompt: string) => string;
  async run(prompt: string, opts?: AgentRunOpts): Promise<string> {
    this.calls.push({ prompt, opts });
    if (this.matcher) return this.matcher(prompt);
    if (!this.queue.length) throw new Error('FakeRunner: no more canned responses');
    return this.queue.shift()!;
  }
}

export function createRunner(): AgentRunner {
  const kind = (process.env.AUTOFIX_AGENT || 'cli').toLowerCase();
  if (kind === 'sdk') return new SdkRunner();
  return new CliRunner();
}

/** Tolerant JSON extraction: strips ```json fences / surrounding prose, returns first JSON value. */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(body) as T;
  } catch {
    // fall back to the first {...} or [...] block
    const start = body.search(/[[{]/);
    if (start >= 0) {
      const open = body[start];
      const close = open === '{' ? '}' : ']';
      const end = body.lastIndexOf(close);
      if (end > start) return JSON.parse(body.slice(start, end + 1)) as T;
    }
    throw new Error(`agent did not return valid JSON: ${text.slice(0, 300)}`);
  }
}
