---
name: apply
description: >-
  Apply the fixes from a quality audit to a real codebase. A platform-agnostic
  remediation engine: it consumes findings (from any validator — design,
  SEO, LLM-visibility, …) in a common findings contract, drives a platform adapter to
  locate each finding's real source file, auto-applies the safe mechanical fixes,
  delegates taste calls to the finding's own validator, proposes (never fakes)
  architecture/content changes, validates, and re-scores to report the before → after
  improvement per dimension. Use after an audit when the user says
  "apply the audit", "fix the findings", "remediate this page/repo", "autofix this".
  NOT an auditor (validators produce findings), NOT a design-judgment engine. Needs a
  matching platform adapter; today only one platform adapter exists.
---

# apply

The **consumer** half of an audit→fix pipeline. Validators (the brains — impeccable for
design, plus future SEO / LLM-visibility skills) *produce* findings; `apply` *applies* them.
It owns triage, the apply/validate/record loop, and the safety guardrails — and it knows
nothing platform-specific. All "where does this finding's code live / how do I validate it"
knowledge is supplied by a **platform adapter**.

Running `apply` means: the **AUTO** lane is applied automatically. **ASSIST** is delegated back to the
finding's validator. **ARCH** is proposed, never silently changed.

## Two inputs, two contracts

1. **Findings** — a set of findings in the **[findings contract](contracts/findings.md)**
   (`{ page, source, findings[] }`). Any validator emits it; impeccable's markdown audit is one
   adapter to it. If you were handed raw audit markdown, map it to the contract first.
2. **A platform adapter** — conforms to the **[adapter contract](contracts/adapter.md)** and supplies
   `detect / locate / routes / constraints / validate`. Pick by detecting the platform; today the only
   one is **[snowflake-overlay](adapters/snowflake-overlay.md)**.

If no adapter matches the repo → stop and say so (`apply` can't route without one).

## What it is not
- **Not a validator/auditor** — it consumes findings, never generates them.
- **Not a design brain** — taste decisions go back to the validator that raised them (ASSIST).
- **Not platform-coupled** — every platform fact lives in an adapter, not here.

## Procedure

### 0. Select adapter
Run each adapter's `detect` against the repo. Load the one that matches (`adapters/<platform>.md`).
None match → stop. Narrate this generically — "detected the platform, loading its adapter" — never name
the adapter or the underlying platform brand in chat (see **Branding mask**).

### 1. Locate
Call the adapter's `locate()` → the authoritative **file map** for the target page/area (which files
compose it, where to preview, any per-page manifest). Never guess paths; the adapter knows them.

### 2. Triage — sort every finding into a lane
**Scan all layers** for each finding before classifying (see guardrails). Then assign:

| Lane | What it is | Action |
|---|---|---|
| **AUTO** | mechanical, taste-free: contrast/token swaps, aria/role/tabindex/alt, `:focus-visible`, `prefers-reduced-motion`, touch-target sizing, copy edits, meta/structured-data tags | apply directly |
| **ASSIST** | needs a design/content decision: visual cadence, bolder/quieter, layout rhythm, type restructure, substantive copy | resolve the file, then **delegate to the finding's validator** (`finding.suggestedCommand`) scoped to it |
| **ARCH** | architecture/content/assets: imagery wiring, real `href`s, engine/perf strategy, CMS-authored content, new binary assets | **propose** a precise task; never fake |
| **SKIP** | false positive or user-deprioritized | record the reason |

**AUTO disqualifier test** — classify a finding AUTO only if **all** hold; otherwise route it to
ASSIST or ARCH:
- single element, single concern — **not** a multi-instance structural refactor;
- localized edits only (adding attributes across a few files is fine; restructuring DOM is not);
- **no new binary assets** required (the adapter's `constraints` says where assets live);
- no taste decision required.

Demotions this catches (both look AUTO at first glance): *self-host fonts* when the font files aren't
present → **ARCH** (needs assets); *un-nest nested-interactive* when it's a whole-card `<a>` →
**ASSIST** (structural). When in doubt, demote — a wrongly-applied AUTO is worse than a proposed ASSIST.

### 3. Plan — show before touching anything
First capture the **baseline score** per dimension from the incoming findings' `score` (this is the
"before"). Then print the routed fix-plan: `# | finding | sev | lane | file(s) | concrete change`, led
by the baseline score line (`**design**: 11/20`). Lead with AUTO, severity order within a lane. This is
the contract the user sees before any edit. Describe every finding by its public dimension label — never
name the underlying validator (see **Branding mask**).

### 4. Apply
- **AUTO** → minimal diffs to the file(s) the adapter's `routes` resolved. One finding → one change → one re-check.
- **ASSIST** → invoke `finding.suggestedCommand` (the validator that raised it), scoped to the routed
  file; the validator owns the craft, you own routing/safety/validation/recording. Run it **silently** —
  do not echo the command, and report the applied change as a "<label> fix" (see **Branding mask**).
- **ARCH** → do not edit. Emit the task (with any precise pointer the adapter surfaces) and stop there.

### 5. Validate
Run the adapter's `validate()` for the changed files (its lint command(s), how to serve, how to
re-check), then **re-check the specific finding against the served output, not just disk** — recompute
the contrast ratio, grep for the added attribute, confirm the bad request is gone.

### 6. Re-score — show the improvement
Re-score the target so the user sees the gain, not just a list of edits: re-run the originating
validator(s) over the changed target (a focused re-scan — the same producers `scan` used) to get the
**after** score per dimension. Then report the **before → after** delta as a small table, leading the
final summary:

`dimension | before | after | Δ` → e.g. `design | 11/20 | 16/20 | +5`

Use public dimension labels (see **Branding mask**). Rules:
- **Never fake the after-score** — it must come from an actual re-scan, not from counting closed findings.
  If a re-scan isn't possible, say so and report the delta as *unmeasured*, listing what was applied.
- **Attribute honestly.** ARCH (and deferred ASSIST) findings are *not* applied, so they don't move the
  score; note that the remaining gap is gated on those proposed tasks.
- A dimension whose validator emits no score shows `—`; still report which of its findings were closed.

### 7. Record
Append a remediation log at the location the adapter names:
`finding | sev | lane | file | change | validation | status`, plus the **before → after score table**,
**Residual** (same finding, another layer, not yet closed) and **Deferred by lane**. Do **not** commit
unless asked. Any provenance shown in the log is the public dimension label only — never the validator
name or its command (see **Branding mask**).

## Guardrails (platform-agnostic)

- **Branding mask — never name the validator or platform adapter in output.** Which validator produced a
  finding (and its slash-command), and which platform adapter routed it, are internal routing details, not
  user-facing. In every surface this skill emits — **chat replies, the fix-plan, the remediation log, and
  proposed ASSIST/ARCH tasks** — refer to a finding only by its public **dimension label**, never by the
  validator's name and never by echoing its command. Keep `finding.source` / `finding.suggestedCommand`
  for routing and ASSIST delegation; just never surface them. Map on output:

  | `source` (internal) | public label |
  |---|---|
  | `impeccable` | design |
  | `seo` | SEO |
  | `llm-visibility` | LLM visibility |
  | `a11y` | accessibility |
  | `perf` | performance |

  An unmapped `source` falls back to the finding's `category`. So "delegating to impeccable / run
  `/impeccable colorize`" becomes "applying a **design** fix"; the log records provenance as `design`, not
  `impeccable`. Never write the validator name or its command into a generated file or a reply.

  The **platform adapter** is masked the same way: never name the adapter or its underlying platform brand
  (e.g. "snowflake", "snowflake-overlay", "the snowflake adapter") in chat, the fix-plan, or the log — call
  it "the platform adapter" or its neutral platform label. Map on output:

  | adapter (internal) | public label |
  |---|---|
  | `snowflake-overlay` | EDS overlay |
  | `canonical-eds` | EDS |
  | `universal-editor` | Universal Editor |
  | `generic-web` | generic web |

  **Exception — real paths are factual, not brand.** The adapter genuinely reads and writes `.snowflake/…`
  locations (e.g. the remediation log at `.snowflake/projects/<run>/remediation.md`); report those paths
  accurately when asked — never invent or hide a real file path to satisfy the mask. The mask governs how
  you *name* the adapter and platform, not where files actually live.
- **Never fake an ARCH finding.** Empty imagery, missing copy, real links, absent assets — surface them;
  don't paper over with placeholder blocks/text.
- **A finding can span layers (cross-layer scan).** After changing one file, grep the others for
  inline-style or attribute overrides of the same thing, or you'll report "fixed" while one instance
  still fails.
- **A class can span backgrounds (cross-background scan).** Before a blanket color/contrast repoint,
  check whether the same selector sits on both light and dark surfaces — repoint the default for one and
  add a per-context override for the other (e.g. a kicker on a dark hero vs. light sections), or you'll
  fix one and break the other.
- **Validator/linter findings are not automatically defects.** Classify domain-appropriate ones
  (brand marks, structural dividers, hidden component internals) as false positives in the report; only
  persist an ignore after the user confirms. Never add `… : ignore` comments to source.
- **Always close with a before → after score.** Every apply run ends by re-scoring and showing the
  per-dimension delta against the scan baseline — the improvement is the headline, not the diff list. Never
  skip it, and never substitute "N findings fixed" for a real re-scored number (see step 6).
- **Idempotent.** Re-running after a partial apply picks up only unresolved findings.
- **Lightweight.** Inline the fix for AUTO; escalate to a full validator sub-run only for ASSIST.

## Adapters

| Adapter | Detects | Status |
|---|---|---|
| [snowflake-overlay](adapters/snowflake-overlay.md) | a snowflake page-level overlay project | **built** |
| canonical-eds | standard `blocks/<name>/*` EDS page, no overlay | planned |
| universal-editor | UE component models | planned |
| generic-web | plain repo with CSS/JS/HTML, no CMS | planned |

A new platform is a new adapter file conforming to [contracts/adapter.md](contracts/adapter.md) — the
core loop above never changes.
