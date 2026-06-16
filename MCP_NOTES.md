# MCP_NOTES — wrapping `scan` + `apply` as MCP tools

Working notes extracted from the skills before building the MCP server. The MCP **wraps** the skills
(`skills/scan/SKILL.md`, `skills/apply/SKILL.md`); it does not reimplement them.

---

## 1. The findings contract (shared interface)

Source: `skills/apply/contracts/findings.md`. One object **per validator**; `scan` emits a **union**
(single object or array) across validators.

```json
{
  "page": "test-2",                       // page slug / route / file audited
  "source": "impeccable",                 // validator id: impeccable | seo | llm-visibility | a11y | perf | …
  "score": { "value": 11, "max": 20 },    // ALWAYS emitted — baseline for apply's before/after; null if validator has none
  "findings": [
    {
      "id": "contrast-kicker",            // stable id — idempotency key across re-runs
      "severity": "P1",                   // P0 | P1 | P2 | P3
      "category": "accessibility",        // accessibility | performance | seo | llm-visibility | theming | responsive | anti-pattern | content | …
      "location": ".kicker",              // selector / DOM hint / file:line — adapter resolves to real file(s)
      "recommendation": "…use an AA-safe token.",
      "suggestedCommand": "/impeccable colorize", // optional — validator sub-command for ASSIST delegation
      "evidence": "2.69:1 vs 4.5 required"        // optional — measurement/quote
    }
  ]
}
```

Key invariants:
- `source` + `suggestedCommand` are **routing data** — kept in the payload (apply needs them for ASSIST),
  **never surfaced** (see mask).
- `category` + `location` are what the adapter's `routes` key on.
- `severity` only drives ordering; **lane is decided by apply's triage**, not the validator.
- `id` must be stable → idempotent re-runs skip already-closed findings.
- `score` is **always emitted** per source. No native score → `null` (display `—`), never faked.

## 2. Lane definitions (apply triage)

Source: `skills/apply/SKILL.md` §2. Every finding sorts into exactly one lane.

| Lane | What | Action by apply |
|---|---|---|
| **AUTO** | mechanical, taste-free: contrast/token swaps, aria/role/tabindex/alt, `:focus-visible`, `prefers-reduced-motion`, touch-target, copy edits, meta/structured-data | apply directly |
| **ASSIST** | needs a design/content decision: visual cadence, bolder/quieter, layout rhythm, type restructure, substantive copy | resolve file → **delegate to the finding's validator** (`suggestedCommand`), scoped |
| **ARCH** | architecture/content/assets: imagery wiring, real `href`s, perf strategy, CMS content, new binary assets | **propose** a precise task — never fake/apply |
| **SKIP** | false positive or user-deprioritized | record reason |

**AUTO disqualifier test** — AUTO only if ALL hold, else demote: single element/concern (not multi-instance
structural), localized edits only, **no new binary assets**, no taste decision. When in doubt, demote.

MCP `lanes` input gates which lanes act: default `["AUTO","ASSIST"]`. ARCH is always proposal-only.

## 3. Branding mask (enforced in code on the way out)

Sources: mask sections in both skills. The mask is a **display-layer** rule — internal identity stays in
data, never appears in output text.

**Validator map** (`source` → public label):

| source | label |
|---|---|
| `impeccable` | design |
| `seo` | SEO |
| `llm-visibility` | LLM visibility |
| `a11y` | accessibility |
| `perf` | performance |

Unmapped `source` → fall back to the finding's `category`.

**Adapter map** (adapter id → public label):

| adapter | label |
|---|---|
| `snowflake-overlay` | EDS overlay |
| `canonical-eds` | EDS |
| `universal-editor` | Universal Editor |
| `generic-web` | generic web |

Rules for the MCP:
- Never let `impeccable` / `snowflake*` / a `/impeccable …` command appear in `plan`, `applied`,
  `proposed`, `deferred`, `adapter`, score labels, or the remediation log **text**.
- **Keep** `source` / `suggestedCommand` inside the findings payload (ASSIST routing needs them).
- **Exception — real paths are factual.** The real `.snowflake/...` paths (incl. the log path) are reported
  accurately. The mask governs how we *name* the validator/adapter, not where files live.
- Enforcement = a code pass over outbound JSON (`scrubText`) that fails loudly if a brand token leaks into a
  text field; the smoke suite includes a mask-leak test.

## 4. Scoring (per validator) + before/after

- Each source carries `score: { value, max }`. The MCP normalizes to
  `{ value, max, dimensions?: { <dim>: number } }` per validator label.
- `scan` returns the **baseline** (`scores`).
- `apply` step 6 re-scores: re-run the originating validator(s) over the changed target (a **real re-scan**)
  → `after`. Report `{ before, after, delta }` per dimension.
- **Honesty rails:** after-score must come from an actual re-scan — never from counting closed findings. If
  the env can't re-scan → `after: null`, mark `"unmeasured"`. ARCH/deferred findings don't move the score
  (note the gap is gated on proposed tasks).

## 5. Adapter contract + the one built adapter

Source: `contracts/adapter.md`, `adapters/snowflake-overlay.md`. An adapter supplies five things the core
calls by name: `detect / locate / routes / constraints / validate`, and **names where the remediation log
goes**.

- **snowflake-overlay `detect`:** `.snowflake/projects/<run>/state.json` exists with
  `conversionLevel: "page-level"` (+ `main.dataset.overlay` at runtime).
- **remediation log path (adapter-named):** `.snowflake/projects/<run>/remediation.md`.
- **validate toolchain:** `npx stylelint styles/<t>.css`, `node --check scripts/<t>-animations.js`,
  serve via `npx -y @adobe/aem-cli up --no-open`, re-check the served file. **If toolchain unavailable →
  `status: "applied-unverified"`** rather than claiming verification.
- **No adapter `detect()` matches → `{ error: "no_adapter" }`.** Never guess paths.

## 6. Architecture decision

**These skills are LLM-driven, not deterministic.** `scan` delegates auditing to a validator (an LLM design
review); `apply` does judgment-based triage + ASSIST delegation. A faithful MCP therefore runs an **agent in
the loop** per tool and constrains its final answer to strict JSON. We do **not** regex-fake the LLM parts.

**Chosen approach: TypeScript MCP server (stdio) + an injectable `AgentRunner`.**

- **Language: TypeScript / Node.** Env has node v25 / npm 11; python is 3.9 (too old). MCP TS SDK is
  first-class. `zod` for schema validation of both inbound args and outbound JSON.
- **Agent mechanism: shell out to the authenticated `claude` CLI in headless mode**
  (`claude -p "<prompt>" --output-format json …`) as the default `AgentRunner`. Rationale: the `claude` CLI
  (v2.1) is already present **and authenticated** in this environment, while `ANTHROPIC_API_KEY` is **not
  set** — so the CLI path works out-of-the-box and reuses the existing Claude Code subscription auth. The
  `@anthropic-ai/claude-agent-sdk` is a drop-in alternative behind the same interface for API-key setups; the
  runner is swappable via env (`AUTOFIX_AGENT=cli|sdk`).
- **Injectable runner** = the key testability move. `AgentRunner` is an interface
  (`run(prompt, opts) → Promise<rawText>`). Production uses the CLI/SDK; tests inject a **fake** runner that
  returns canned skill output. This makes the deterministic glue (arg parsing, findings polymorphism,
  persistence, masking, schema validation, no-adapter detection, dryRun gating) fully unit-testable **without
  burning tokens or needing a live target** — and keeps the LLM boundary honest (real runner = real agent).
- **Structured output enforcement:** each tool's agent prompt embeds the relevant SKILL.md + contracts and
  ends with an "emit ONLY this JSON, matching this schema" instruction; the handler then parses, runs the
  **outbound mask scrub**, and **validates against the §2 zod schema** before returning. Parse/validation
  failure → one bounded retry, then a structured error.

**What is code vs. agent:**

| Concern | Owner |
|---|---|
| arg parse, defaults, findings polymorphism (`object \| array \| {path} \| {markdown}`) | code |
| `.audit/<page>/` persistence, real path resolution | code |
| outbound branding-mask scrub + leak assertion | code |
| JSON schema validation (in + out) | code |
| no-adapter detection wiring, dryRun/commit/lanes gating | code |
| design audit, markdown→contract mapping, triage, ASSIST craft, re-score | **agent (skill)** |

**Default model:** `claude-opus-4-8` (latest capable); `claude-sonnet-4-6` selectable via env for cost.
**Required filesystem capability:** the server reads/writes the target repo (`.audit/`, source edits, the
adapter-named log). This is intentional and documented.
