# Adapter contract (platform → autofix)

Everything platform-specific lives in an adapter so the core engine stays generic. An adapter is a
reference file (`adapters/<platform>.md`) that supplies five things. The core calls them by name in
its procedure; it never hardcodes a path, lint command, or routing rule.

## What an adapter must provide

### `detect`
How to recognize this platform from the repo, cheaply and unambiguously. The core runs every adapter's
`detect` and loads the one that matches.
- *snowflake-overlay:* `.snowflake/projects/<run>/state.json` exists with `conversionLevel: page-level`.
- *canonical-eds:* `blocks/<name>/` present and no overlay state.

### `locate(page)`
Return the **file map** for the target page/area: which source files compose it, plus any per-page
manifest the adapter reads to avoid guessing, plus how to preview (local URL / dev server). The core
treats this as the authoritative address book.

### `routes`
The **routing table**: `category` + `location` (from the findings contract) → the file(s) to edit.
This is the heart of the adapter — it encodes where each kind of fix actually lives on this platform.
It may also flag conditional demotions (e.g. "font self-hosting → ARCH if the font files are absent").

### `constraints`
The platform's safety rules the core must respect:
- **off-limits** files (never edit — e.g. a vendored engine);
- **vendor-exempt** globs (don't expect them to pass lint; syntax-check only);
- **mirror** targets (a change here must be copied there);
- **where assets live** (so the AUTO disqualifier's "no new assets" test is concrete);
- **known false positives** (linter/hook hits that are intentional on this platform).

### `validate(files)`
How to prove a change is good on this platform:
- the lint/syntax command(s) for each file type (respecting `constraints.vendor-exempt`);
- how to **serve** the result and the **re-check** recipe (fetch the served file and confirm the
  specific finding is closed — recompute contrast, grep the attribute, etc.).

It also names **where the remediation log goes** (the core's step 6 writes there).

## Rules

- The core never contains platform paths, lint flags, or routing rules — if you're tempted to write one
  in `SKILL.md`, it belongs in an adapter.
- An adapter should **read** the platform's own source of truth rather than re-encode it. (E.g. the
  snowflake adapter reads `.snowflake/.../decisions.json` and the substrate manifest instead of
  hardcoding substrate facts — one source of truth, consumed not copied.)
- Adapters are independent: adding `canonical-eds` or `universal-editor` touches no other file and
  changes no core behavior.
