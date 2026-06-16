# autofix MCP server

Exposes the `scan` and `apply` skills as two MCP tools — `autofix_scan` and `autofix_apply` — over stdio.
It **wraps** the skills (it does not reimplement them): each tool runs a Claude agent that loads the real
`SKILL.md` + contracts, and the deterministic glue (arg parsing, findings polymorphism, `.audit/`
persistence, the branding mask, schema validation, adapter detection, `dryRun` gating) is plain code.

See [`../MCP_NOTES.md`](../MCP_NOTES.md) for the architecture rationale and the extracted contracts.

## Requirements

- **Node ≥ 22** (the server is run directly as TypeScript via node's type-stripping — no build step).
- An **agent runner**, one of:
  - **`cli`** (default) — the authenticated `claude` CLI on `PATH`. Reuses your existing Claude Code login;
    no `ANTHROPIC_API_KEY` needed.
  - **`sdk`** — `@anthropic-ai/claude-agent-sdk` + `ANTHROPIC_API_KEY` (install the optional dep).
- **Filesystem access (intentional):** the server **reads and writes the target repo** — it persists
  `.audit/<page>/` and, on a real `apply`, edits source files and writes the adapter-named remediation log.
- For `apply`'s `validate()` step the target repo's toolchain (`stylelint`, `node --check`, a dev server)
  should be available; if it isn't, applied fixes are returned with `status: "applied-unverified"` rather
  than claiming verification.

## Install & test

```bash
cd mcp
npm install
npm test          # 8 smoke tests, no API calls (FakeRunner)
npm run typecheck
```

## Register with Claude Code

CLI:

```bash
claude mcp add autofix \
  --env AUTOFIX_AGENT=cli \
  --env AUTOFIX_MODEL=claude-opus-4-8 \
  -- node /ABS/PATH/TO/autofix/mcp/src/server.ts
```

Or copy [`.mcp.json.sample`](.mcp.json.sample) to your project root as `.mcp.json` (adjust the path to
`mcp/src/server.ts`).

### Environment variables

| var | default | meaning |
|---|---|---|
| `AUTOFIX_AGENT` | `cli` | `cli` (claude CLI) or `sdk` (Agent SDK) |
| `AUTOFIX_MODEL` | `claude-opus-4-8` | model for agent runs (`claude-sonnet-4-6` for cost) |
| `AUTOFIX_PERMISSION_MODE` | per-tool | override the CLI permission mode (`default`/`acceptEdits`/`bypassPermissions`/`plan`) |
| `AUTOFIX_SKILLS_DIR` | repo root | dir containing `skills/` (set when running the server outside the autofix repo) |
| `AUTOFIX_CLAUDE_BIN` | `claude` | path to the `claude` binary |
| `AUTOFIX_AGENT_TIMEOUT_MS` | `600000` | per-agent-run timeout |
| `ANTHROPIC_API_KEY` | — | required only for `AUTOFIX_AGENT=sdk` |

## Tools

### `autofix_scan`

Audit a target and emit findings (+ a per-dimension baseline score). Runs only `built` validators; lists
requested-but-`planned` ones in `unavailable` and never fabricates findings for them.

Input: `{ target, types?=["design"], repoPath?, persist?=true }`
Output: `{ page, scores, findings (union), unavailable, artifacts }` — findings are returned inline (so an
orchestrator can pipe scan→apply without disk) and also written to `.audit/<page>/` when `persist`.

### `autofix_apply`

Remediate findings against a real repo. Detects the platform adapter (deterministic), triages into
AUTO/ASSIST/ARCH, applies, validates, and re-scores for a before→after delta.

Input: `{ findings, repoPath, lanes?=["AUTO","ASSIST"], dryRun?=false, commit?=false }`
- `findings` is polymorphic: an object · an array (union) · `{ path }` · `{ markdown }`.
- **`dryRun: true`** returns the **plan only** — no edits, no validate, no log (preview mode).
- **No adapter matches `repoPath`** → `{ "error": "no_adapter", "message": "..." }` (no path-guessing).
- Re-score comes from a **real re-scan**; if the env can't re-scan, `after` is `null` / `status:"unmeasured"`.
- Idempotent on `finding.id`; never commits unless `commit: true`.

Output: `{ adapter, plan, applied, proposed, deferred, score, remediationLog }`.

## Pipeline

```
autofix_scan ──▶ findings union (+ baseline score) ──▶ autofix_apply ──▶ before→after delta
                         │                                   │
                  .audit/<page>/findings.json          adapter-named remediation log
```

## Branding mask

Validator and adapter identities are internal routing details. The server enforces, in code on the way
out, that they never appear in surfaced text: `impeccable → design`, `snowflake-overlay → EDS overlay`,
etc. `source` / `suggestedCommand` stay inside the findings payload (apply needs them to route ASSIST), and
real `.snowflake/...` paths are reported accurately — the mask governs *naming*, not *file locations*. A
smoke test asserts no brand token leaks.
