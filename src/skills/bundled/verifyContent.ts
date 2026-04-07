// Content for the verify bundled skill.
// The upstream markdown assets are optional in this snapshot. Keep startup
// resilient by falling back to an inline placeholder when they are absent.

export const SKILL_MD = `---
description: Verify a code change does what it should by running the app.
---

Use this skill to verify a code change end-to-end.

When richer verify skill markdown assets are available, they can replace this
inline fallback without changing the registration surface.`

export const SKILL_FILES: Record<string, string> = {}
