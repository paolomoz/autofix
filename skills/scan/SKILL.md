---
name: scan
description: >-
  Run one or more quality validators against a target (page / route / repo area) and emit
  findings in the shared findings contract. A thin dispatcher: it delegates to
  validator skills — design / a11y / perf / responsive today; SEO and
  LLM-visibility planned — normalizes each one's output, merges them, and hands the set to
  apply (or just reports). It does NOT judge quality itself and does NOT apply fixes. Use
  when the user says "audit this", "run an audit", "check SEO / LLM-visibility /
  accessibility", or before applying fixes. Pairs with the `apply` skill.
---

# scan

A **dispatcher, not a validator.** It runs the right validator(s) for the dimensions you ask for,
normalizes each one's output into the shared **findings contract**, merges them, and hands the result
to `apply` — or just reports it. The expertise lives in the validators; this skill only routes,
normalizes, and merges.

## What it is / isn't
- **Is:** target resolution → validator registry → invocation → normalization to the findings contract
  → merge → handoff.
- **Isn't:** a source of findings (no built-in audit logic of its own), and not a fixer. **"Audit
  without fix" is a first-class use** — it stops at findings unless you ask to continue.

## Validator registry

| type | concern | validator | status | → findings contract via |
|---|---|---|---|---|
| `design` | visual/UX, accessibility, performance, responsive, theming, anti-patterns | **impeccable** (`/impeccable audit <target>`) | **built** | markdown mapping (below) |
| `seo` | titles/meta, headings, canonical, structured data, sitemap, links | seo validator | planned | native emit |
| `llm-visibility` | AI/GEO discoverability: semantic HTML, `llms.txt`, structured + extractable content | llm-visibility validator | planned | native emit |

Extend by adding a row (+ a mapping if the validator doesn't emit the contract natively). Adding a
validator touches nothing in `apply` — they meet only at the contract.

## Branding mask
Which validator produced a finding is an **internal routing detail**, not user-facing. In everything
this skill *shows or names* — **chat narration, the printed findings table, and per-validator artifact
filenames** — refer to a finding only by its public **dimension label**, never by the validator's name
and never by echoing its `/…` command. Map on output:

| `source` (internal) | public label |
|---|---|
| `impeccable` | design |
| `seo` | SEO |
| `llm-visibility` | LLM visibility |
| `a11y` | accessibility |
| `perf` | performance |

An unmapped `source` falls back to the finding's `category`. The contract's `source` / `suggestedCommand`
are **kept as-is inside `findings.json`** — `apply` needs them to route ASSIST delegation — they are just
never surfaced. So "running impeccable / `/impeccable audit`" is narrated as "running the **design**
validator," and the per-validator dump is `.audit/<page>/design.json`, not `impeccable.json`.

## Procedure

### 1. Resolve target + types
Target = a URL, page slug, or repo area. Types = which validations to run. If unspecified, list the
**built** types and ask (default `design`). Only run types whose validator is `built`; for `planned`
ones, say they're not built yet and skip — **never fake findings for a missing validator.**

### 2. Invoke each requested validator
e.g. `design` → `/impeccable audit <target>`. Capture its full output. Run independent validators in
parallel when possible. Narrate this as running the **design** validator — never echo the validator's
name or its `/…` command in chat (see **Branding mask**).

### 3. Normalize to the findings contract
Map each validator's output to [`../apply/contracts/findings.md`](../apply/contracts/findings.md):
each finding → `{ id, severity, category, location, recommendation, suggestedCommand?, source }`, with
`source` = the validator name. Validators that emit the contract natively skip this step.

### 4. Merge + persist
Combine into a union `{ page, findings[] }` across validators. Write:
- `.audit/<page>/<label>.json` — per-validator, named by the public dimension **label** (e.g.
  `design.json`), not the validator name (see **Branding mask**), and
- `.audit/<page>/findings.json` — the merged union apply consumes (its `source` / `suggestedCommand`
  fields are kept internal for routing, never displayed).

(`.audit/` is generated output — gitignore it.) Print the merged findings as a table:
`# | source | sev | category | location | recommendation` — the `source` column shows the public label,
never the validator name.

### 5. Handoff — don't auto-fix
Offer to run **`apply`** on `.audit/<page>/findings.json`. apply consumes the union and applies its
own triage. **Stop here if the user only wanted the audit.**

## Mapping: impeccable markdown → findings contract
From the audit's **"Detailed Findings by Severity"** block:
- `[P?] Issue name` → `severity` + `id` (slug of the name)
- `Location:` → `location`
- `Category:` → `category` (accessibility | performance | theming | responsive | anti-pattern)
- `Recommendation:` → `recommendation`
- `Suggested command:` → `suggestedCommand`
- `source: "impeccable"`; the health-score table → top-level `score`.

## Non-goals
- **No quality judgment of its own.** "Is this good?" is the validator's call, not the dispatcher's.
- **No fixes.** Applying findings is `apply`'s job.
- **No faking.** A `planned` validator that isn't built yet is reported as unavailable, not improvised.
