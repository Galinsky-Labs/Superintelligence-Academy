# Learning records, courses, assessment and authoring (SIA-011 … SIA-017)

Academy keeps its own PostgreSQL schema (`db/migrations`, applied at start by `npm run start:render`;
`ACADEMY_DATABASE_URL`). The learner identity is the engine identity from the session; projects and artifacts stay
in the engine. Without a database the catalog still renders and record endpoints answer 503.

| Area | Where | Notes |
|---|---|---|
| Catalog & versions (SIA-016) | `content/courses.json`, `lib/courses.mjs`, `/api/courses` | Repository courses + editor-published versions (`course_versions`). Learners keep the version they enrolled in; `updateAvailable` flags newer ones. Access is free (paid checkout is SIA-019). |
| Progress & privacy (SIA-014) | `/api/progress`, `/api/me`, `/api/me/export` | Started/completed lessons with resumable checkpoints; JSON export; full deletion (`{"confirm":"DELETE"}`); analytics events only with consent and erased when consent is withdrawn. |
| Assessment (SIA-011) | `/api/assessments`, `lib/assessment-route.mjs` | Quiz graded server-side; artifact rubrics (word counts, required terms, links, revisions, questions) run on the actual engine artifact fetched as the learner. No model judgement decides a pass. |
| Practice (SIA-012) | course player | Practice runs use the engine simulator explicitly, are labelled PRACTICE · SIMULATED and saved in an "Academy practice" project. Simulator-produced evidence is recorded as practice only and never completes a lesson. |
| Path (SIA-013) | `recommendNext` | Next lesson whose prerequisites are complete, in the declared goal or enrolled courses, with the reason shown; opt-out falls back to plain course order. |
| Authoring (SIA-015) | `/authoring`, `/api/authoring/drafts` | Drafts (new or copied from a course), AI-assisted suggestions via the engine, submit, editorial review. Approval needs an editor in `SIA_EDITOR_IDENTITY_IDS`, a reviewer other than the author (`SIA_ALLOW_SELF_REVIEW=1` lifts this for a single-person team) and all four checks: factual, rights, plagiarism, accessibility. Approval publishes a new immutable course version. |

The four foundation courses in `content/courses.json` (writing, research, code, images; SIA-017) are AI-authored
**previews**: they are labelled "Preview · AI-authored, pending editorial review" until an editor approves them
through the authoring workflow.
