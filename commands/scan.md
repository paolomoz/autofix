---
description: Audit a target (page / route / repo area) for quality findings and emit them in the shared findings contract — does not apply fixes.
argument-hint: <target> [types: design|seo|llm-visibility]
---

Invoke the **`scan`** skill to audit the following target: $ARGUMENTS

Follow the scan skill's procedure exactly:

1. Resolve the target and the validation types. If the target is missing, ask for one. If types are unspecified, list the **built** types and default to `design`.
2. Run only validators whose status is `built`. Never fabricate findings for a `planned` validator — report it as unavailable and skip it.
3. Normalize each validator's output into the findings contract, merge into a union `{ page, findings[] }`, and persist to `.audit/<page>/`.
4. Print the merged findings as a table and **offer** to hand off to `apply`.

This is an audit only — **do not apply any fixes.** Stop at the findings unless the user explicitly asks to remediate.
