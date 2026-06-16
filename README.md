# autofix

A Claude Code **plugin** (and single-plugin **marketplace**) for auditing a target for quality findings and remediating them.

## What's inside

| Skill | Command | What it does |
|---|---|---|
| `scan` | `/autofix:scan <target>` | Dispatcher that runs quality validators (design/impeccable today; SEO + LLM-visibility planned) and emits findings in the shared findings contract. Does **not** apply fixes. |
| `apply` | `/autofix:apply <findings>` | Platform-agnostic remediation engine that consumes the findings contract, locates each finding's source file via a platform adapter, auto-applies safe fixes, delegates taste calls, and proposes architecture/content changes. |

The two are designed to pair: `audit` produces findings → `autofix` applies them.

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
```

Skills sourced from the `skill-1` branch of `claude-design-eds`.
