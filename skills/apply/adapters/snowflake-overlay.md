# Adapter: snowflake-overlay

Platform adapter for pages converted by the **snowflake** skill in page-level overlay mode (an EDS
site where the design is assembled client-side from a template + fragments + per-template CSS + a
vendored behavior JS, and standard block decoration is skipped). Conforms to
[../contracts/adapter.md](../contracts/adapter.md).

`<t>` below = the template name (e.g. `test-2`); `<run>` = the snowflake project dir.

## `detect`
This adapter applies when **all** hold:
- `.snowflake/projects/<run>/state.json` exists with `conversionLevel: "page-level"` and a `templateName`;
- at runtime `main.dataset.overlay` is set (overlay engine active).

Resolve `<t>` from the audited URL (`…/<pageSlug>` → `state.json.pageSlug`/`templateName`),
`meta[name=template]`, or `body[data-template]`.

## `locate(page)`
Read the snowflake project's own state — **this is the source of truth, don't guess paths**:
- `state.json` → `templateName`, `deployedPaths` (the exact files composing the page), `localUrl`,
  `productionUrl`, `daEditorUrl`.
- `decisions.json` → `headLinks` (external `<link>`s / fonts), `imageSlots` (`ids`, `authorable`,
  `followUp`), `inlineStyleLines` / `inlineScriptLines`, the section list.
- `assets/substrate/MANIFEST.json` (in the snowflake skill) → substrate conventions, when present.

## `routes`
| Finding `category` / `location` | File to edit |
|---|---|
| color / contrast / spacing / type / motion in the page body | `styles/<t>.css` |
| header / utility / primary-nav markup or copy | `fragments/<t>/header.html` (CSS still in `styles/<t>.css`) |
| footer / mobile-menu markup, aria, focus trap | `fragments/<t>/footer.html` (+ wiring in `scripts/<t>-animations.js`) |
| section structure, slot copy, element semantics (role/aria/tabindex), font `<link>`, JSON-LD / meta | `templates/<t>.html` |
| behavior: menu/scroll/reveal/chips, reduced-motion JS, `<image-slot>` | `scripts/<t>-animations.js` |
| **font self-hosting** | **First check `fonts/` for the family** — absent (e.g. only Roboto) → demote to **ARCH** (needs woff2 assets). To apply: drop the CDN `<link>` from `templates/<t>.html` (`decisions.json.headLinks`) → add `@font-face` to **`styles/<t>.css`** (NOT `styles/fonts.css`, which the substrate keeps deliberately empty). |
| LCP / paint-gating / critical CSS | overlay engine `scripts/scripts.js` + `styles/styles.css` (`body{display:none}`) — **propose**, confirm before touching the shared engine |
| imagery population | per `decisions.json.imageSlots.followUp`: convert `<image-slot>`→background-image slot, or add committed `src=` — usually **ARCH** (needs real assets) |
| page metadata (title/description/canonical/og) | DA page-metadata table (`daEditorUrl`) — usually **ARCH/content**, or `head.html` for site-wide |

## `constraints`
- **off-limits:** `scripts/aem.js` (core EDS library — never edit).
- **vendor-exempt** (don't expect lint to pass; syntax-check only): per-template CSS `styles/<t>.css`
  (via `.stylelintignore`) and behavior JS `scripts/*-animations.js` (via `.eslintignore`).
- **mirror:** if `drafts/<t>.html` is a standalone preview copy, check whether a change needs mirroring there.
- **assets live in:** `fonts/` (webfonts), committed image `src=` or DA media (images). If a fix needs a
  file not already here → ARCH.
- **known false positives:** impeccable hook hits inside the vendored `<image-slot>` block
  (`broken-image` on its shadow-DOM `<img>`s) — component internals, hidden until filled. Also brand
  marks built from borders and 1px structural dividers.
- edit **code source** in the repo, never the live/served HTML.

## `validate(files)`
- **CSS:** `npx stylelint styles/<t>.css --ignore-path /dev/null` → confirm **no new parse errors**
  (the standing single-line/hex/`currentColor` violations are pre-existing vendor style — not yours).
- **JS:** `node --check scripts/<t>-animations.js` (syntax gate; it's vendor-exempt from eslint).
- **Serve:** `npx -y @adobe/aem-cli up --no-open` in the working tree. In a git worktree the CLI
  auto-assigns a per-branch port (read it from server output — don't assume 3000).
- **Re-check against the served file:** `curl -s localhost:<port>/styles/<t>.css | grep …`;
  recompute contrast ratios; grep for the added aria attribute; confirm no CDN font request remains.

## remediation log
`.snowflake/projects/<run>/remediation.md`.
