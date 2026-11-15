-- Academy's own learning records (SIA-014/016/011/015). Identity = the engine identity id from the session.
-- Project ownership stays in the engine; this schema holds only educational state.
CREATE TABLE IF NOT EXISTS learners (
  identity_id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '' CHECK (length(display_name) <= 160),
  adaptive_recommendations boolean NOT NULL DEFAULT true,
  analytics_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Published course versions created through the authoring workflow (repository courses are versioned in git).
CREATE TABLE IF NOT EXISTS course_versions (
  course_id text NOT NULL CHECK (course_id ~ '^[a-z0-9-]{3,100}$'),
  version integer NOT NULL CHECK (version >= 1),
  content jsonb NOT NULL,
  approved_by uuid NOT NULL,
  draft_id uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, version)
);
CREATE TABLE IF NOT EXISTS enrollments (
  identity_id uuid NOT NULL REFERENCES learners(identity_id) ON DELETE CASCADE,
  course_id text NOT NULL,
  course_version integer NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, course_id)
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  identity_id uuid NOT NULL REFERENCES learners(identity_id) ON DELETE CASCADE,
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  course_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('started','completed')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, course_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES learners(identity_id) ON DELETE CASCADE,
  course_id text NOT NULL,
  course_version integer NOT NULL,
  lesson_id text NOT NULL,
  answers jsonb NOT NULL,
  quiz_score numeric NOT NULL,
  rubric jsonb,
  passed boolean NOT NULL,
  practice_only boolean NOT NULL DEFAULT false,
  feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_attempts_learner ON assessment_attempts(identity_id, course_id, lesson_id, created_at DESC);
-- Educational analytics are separate from progress and recorded only with consent.
CREATE TABLE IF NOT EXISTS learning_events (
  id bigserial PRIMARY KEY,
  identity_id uuid NOT NULL REFERENCES learners(identity_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (length(kind) <= 60),
  course_id text, lesson_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS authoring_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  course_id text NOT NULL CHECK (course_id ~ '^[a-z0-9-]{3,100}$'),
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','changes_requested','approved','published')),
  ai_assisted boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS authoring_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES authoring_drafts(id) ON DELETE CASCADE,
  draft_revision integer NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','request_changes')),
  checks jsonb NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
