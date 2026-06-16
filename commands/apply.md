---
description: Apply the fixes from a quality audit to a real codebase — auto-applies safe mechanical fixes, delegates taste calls, proposes architecture/content changes.
argument-hint: <findings.json | page> 
---

Invoke the **`apply`** skill to remediate the following findings / target: $ARGUMENTS

Follow the apply skill's procedure exactly:

1. Select a platform adapter by running each adapter's `detect` against the repo. If none match, stop and say so — `apply` cannot route without an adapter.
2. Load the findings (from `.audit/<page>/findings.json` or the provided set). If handed raw audit markdown, map it to the findings contract first.
3. Use the adapter's `locate()` to build the authoritative file map — never guess paths.
4. Triage every finding into AUTO / ASSIST / ARCH / SKIP, then print the routed fix-plan **before touching anything**.
5. Apply: AUTO directly, ASSIST by delegating to the finding's own validator, ARCH proposed (never faked).
6. Validate via the adapter and re-check each finding against served output, then record the remediation log.

Respect every guardrail in the skill — never fake an ARCH finding, scan across layers and backgrounds, and do not commit unless asked.
