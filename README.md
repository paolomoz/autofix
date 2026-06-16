# autofix

A Claude Code **plugin** (and single-plugin **marketplace**) for auditing a target for quality findings and remediating them.

## What's inside

| Skill | Command | What it does |
|---|---|---|
| `scan` | `/autofix:scan <target>` | Dispatcher that runs quality validators (design/impeccable today; SEO + LLM-visibility planned) and emits findings in the shared findings contract. Does **not** apply fixes. |
| `apply` | `/autofix:apply <findings>` | Platform-agnostic remediation engine that consumes the findings contract, locates each finding's source file via a platform adapter, auto-applies safe fixes, delegates taste calls, and proposes architecture/content changes. |

The two are designed to pair: `scan` produces findings → `apply` applies them.

## Install

```
/plugin marketplace add paolomoz/autofix
/plugin install autofix@autofix-marketplace
```

Then invoke either skill directly, or via its command: `/autofix:scan <target>` and `/autofix:apply <findings.json | page>`.

## Layout

```
.claude-plugin/
  plugin.json          # plugin manifest (name: autofix)
  marketplace.json     # marketplace manifest (name: autofix-marketplace, source ./)
commands/
  scan.md              # /autofix:scan  → invokes the scan skill
  apply.md             # /autofix:apply → invokes the apply skill
skills/
  scan/SKILL.md
  apply/SKILL.md
  apply/contracts/     # findings + adapter contracts
  apply/adapters/      # platform adapters (snowflake-overlay today)
mcp/                   # MCP server exposing scan + apply as callable tools
```

Skills sourced from the `skill-1` branch of `claude-design-eds`.

## MCP server

The same two skills are also exposed as **MCP tools** — `autofix_scan` and `autofix_apply` — for use
outside the Claude Code plugin (orchestrators, CI, other MCP clients). The server **wraps** the skills:
each tool runs a Claude agent that loads the real `SKILL.md` + contracts and returns strict JSON; the glue
(arg parsing, findings polymorphism, `.audit/` persistence, the branding mask, schema validation, adapter
detection, `dryRun` gating) is deterministic code. See [`mcp/README.md`](mcp/README.md) and
[`MCP_NOTES.md`](MCP_NOTES.md).

```
autofix_scan ──▶ findings union (+ baseline score) ──▶ autofix_apply ──▶ before→after delta
```

- **Pipeline:** `scan` returns a findings union; pipe it straight into `apply`.
- **Preview:** `autofix_apply { dryRun: true }` returns the plan only — no edits.
- **No adapter:** `apply` against a repo no adapter matches returns `{ "error": "no_adapter" }` (no path-guessing).

Quick start:

```bash
cd mcp && npm install && npm test
claude mcp add autofix -- node "$PWD/src/server.ts"
```
