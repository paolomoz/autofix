# autofix — design rationale

Why the skill has the shape it does. The *what* lives in `SKILL.md` + `contracts/` + `adapters/`;
this is the *why* and the deferred work.

## What it is
A platform-agnostic **remediation engine**: consume findings from any validator, route each to its
real source file, auto-apply the safe ones, delegate taste to the validator, propose the rest, validate.
It is the **consumer** in an audit→fix pipeline — never a producer of findings.

## How the shape was reached (the forces)
The design moved outward as requirements were added; each step is encoded in the structure:

1. **"Fix a design audit on an overlay page."** → the core loop (triage → plan → apply → validate →
   record) and the AUTO/ASSIST/ARCH lanes. The bridge value was: impeccable knows craft, the snowflake
   substrate knows file layout — autofix routes between them.
2. **"I'll run other validations too (SEO, LLM-visibility)."** → split **producers from the consumer**.
   Validators are independent and emit the **findings contract** (`contracts/findings.md`); autofix is
   the single consumer. Adding a validation type touches nothing here.
3. **"Generalize autofix beyond snowflake/overlay."** → split the **engine from the platform**. All
   platform facts (routing, constraints, validation, locate) live behind the **adapter contract**
   (`contracts/adapter.md`); the core holds none. snowflake became *an adapter*, not the host.

So there are exactly **two seams** — findings (validator→core) and adapter (platform→core) — and
everything else is pluggable.

## Decisions worth remembering
- **Don't merge into snowflake.** Tempting (autofix's knowledge *is* substrate knowledge), but it
  conflicts with generalizing. Instead the snowflake adapter **reads** snowflake's own
  `decisions.json` / substrate manifest — one source of truth, consumed not copied.
- **audit stays plural and external.** "audit" is a *family* of validators, not one command. A thin
  dispatcher (`audit design|seo|llm`) can front them, but the brains stay in their own skills; autofix
  never audits.
- **When in doubt, demote.** The AUTO disqualifier exists because real findings ("self-host fonts",
  "un-nest nested-interactive") looked mechanical but needed assets/refactor. A wrong AUTO is worse
  than a proposed ASSIST/ARCH.
- **Guardrails earned from dogfooding:** cross-layer scan (inline-style overrides) and cross-background
  scan (same selector on dark+light) both came from applying it to real pages (test-1, test-2).

## Deferred (YAGNI until needed)
- Adapters for `canonical-eds`, `universal-editor`, `generic-web`.
- The `scan` dispatcher skill over the validators.
- A `seo` / `llm-visibility` validator emitting the findings contract.
- Promote from this repo's project skill to `~/.claude/skills/apply/` for global invocation, and have
  snowflake publish its adapter facts in its substrate manifest so the adapter reads rather than encodes.
- Optional: `/impeccable audit --json` emitting the findings contract directly (kills markdown parsing).
