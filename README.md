# autofix

A Claude Code **plugin** (and single-plugin **marketplace**) for auditing a target for quality findings and remediating them.

## What's inside

| Skill | Command | What it does |
|---|---|---|
| `audit` | `/autofix:audit <target>` | Dispatcher that runs quality validators (design/impeccable today; SEO + LLM-visibility planned) and emits findings in the shared findings contract. Does **not** apply fixes. |
| `autofix` | `/autofix:autofix <findings>` | Platform-agnostic remediation engine that consumes the findings contract, locates each finding's source file via a platform adapter, auto-applies safe fixes, delegates taste calls, and proposes architecture/content changes. |

The two are designed to pair: `audit` produces findings → `autofix` applies them.

## Install

```
/plugin marketplace add paolomoz/autofix
/plugin install autofix@autofix-marketplace
```

Then invoke either skill directly, or via its command: `/autofix:audit <target>` and `/autofix:autofix <findings.json | page>`.

## Layout

```
.claude-plugin/
  plugin.json          # plugin manifest (name: autofix)
  marketplace.json     # marketplace manifest (name: autofix-marketplace, source ./)
commands/
  audit.md             # /autofix:audit  → invokes the audit skill
  autofix.md           # /autofix:autofix → invokes the autofix skill
skills/
  audit/SKILL.md
  autofix/SKILL.md
  autofix/contracts/   # findings + adapter contracts
  autofix/adapters/    # platform adapters (snowflake-overlay today)
```

Skills sourced from the `skill-1` branch of `claude-design-eds`.
