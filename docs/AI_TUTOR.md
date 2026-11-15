# Lesson-scoped AI tutor (SIA-008) and engine session (SIA-002)

**Session.** `/signin` → `POST /api/session` verifies an engine API token (`/v1/me`, `/v1/tenants`) and seals it
(AES-256-GCM, `SIA_SESSION_SECRET`) in an `HttpOnly; SameSite=Lax; Secure` cookie. `/v1/*` is a same-origin proxy to
`ENGINE_API_URL` that adds the bearer token and `X-SIE-Product: academy` (cross-site writes and `/v1/dev/*` refused).
`/auth/academy/*` serves the shared ProjectPortal client, so the portal uses Academy's origin. The same engine
identity signs in to Command Center, so projects move between the products.

**Tutor.** `POST /api/tutor {tenantId, lessonId, question, shareArtifact?, projectId?, artifactId?}` streams SSE:
- Context is only approved (published) lesson text: the lesson, its prerequisites, then same-domain lessons ranked by
  word overlap (max 4). No other learner history is sent.
- A project artifact is included only when the learner ticks the consent box and picks it; it is marked as data,
  not instructions, and truncated to 6,000 characters.
- The system prompt requires `[L:lesson-id]` citations and an `Uncertain:` label for anything the lessons do not
  cover; the UI highlights those lines.
- Spend is bounded by the engine: per-question ceiling `SIA_TUTOR_BUDGET_MICRO` (default 50,000 µ$ = $0.05) and
  `maxOutputTokens` 1,200. Without provider keys the engine's simulator answers and the answer is labelled SIMULATED.
- Questions are stored as artifacts in the learner's own "Academy tutor" engine project.
