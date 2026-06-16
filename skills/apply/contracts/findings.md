# Findings contract (validator → autofix)

The shape every validator emits and autofix consumes. Decouples the *producers* (design,
SEO, LLM-visibility, perf, …) from the single *consumer* (autofix): a new validation type is a
new producer of this same object — it touches nothing in autofix or any adapter.

## Schema

```json
{
  "page": "test-2",                    // page slug / route / file the audit targeted
  "source": "impeccable",              // which validator produced this: impeccable | seo | llm-visibility | a11y | perf | …
  "score": { "value": 11, "max": 20 }, // validator-defined quality score — ALWAYS emitted; the baseline apply compares its after-score against
  "findings": [
    {
      "id": "contrast-kicker",         // stable id (idempotency key for re-runs)
      "severity": "P1",                // P0 | P1 | P2 | P3
      "category": "accessibility",     // accessibility | performance | seo | llm-visibility | theming | responsive | anti-pattern | content | …
      "location": ".kicker",           // selector / DOM hint / file:line — adapter resolves this to real file(s)
      "recommendation": "Accent green text on light bg is 2.7:1; use an AA-safe token.",
      "suggestedCommand": "/impeccable colorize",  // optional — the validator sub-command for ASSIST delegation
      "evidence": "2.69:1 vs 4.5 required"          // optional — measurement/quote backing the finding
    }
  ]
}
```

## Field notes

- **`source`** lets autofix delegate ASSIST findings back to the right brain and lets the record show
  provenance when several validators feed one run.
- **`category`** + **`location`** are what the **adapter's `routes`** key on. Keep `category` from the
  shared vocabulary above so adapters can map it; put specifics in `location`.
- **`severity`** drives ordering (P0→P3) and nothing else; lane is decided by autofix's triage, not by
  the validator.
- **`suggestedCommand`** is advisory. If absent, autofix infers the ASSIST target from `source` +
  `category`, or asks.
- **`id`** must be stable across runs so re-running autofix skips already-closed findings.
- **`score`** is **always emitted** (per source). It's the unit of the user-visible improvement: scan
  reports it as the baseline, and after applying, autofix re-scores and reports the **before → after**
  delta per dimension. A validator with no native score reports `null` (shown as `—`), never a faked number.

## Adapters to this contract

A validator that doesn't emit JSON natively gets a thin mapping step:

- **impeccable** — its markdown audit's "Detailed Findings by Severity" block maps 1:1:
  `[P?] name → id/severity`, `Location → location`, `Category → category`,
  `Recommendation → recommendation`, `Suggested command → suggestedCommand`.
- **future validators** (seo, llm-visibility) — emit this object directly; no mapping needed.

autofix accepts either a single findings object or an array of them (the **union** across validators)
so one remediation pass can act on design + SEO + LLM-visibility findings together.
