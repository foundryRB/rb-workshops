-- The session store (sessions, revisions) and the capture store (runs,
-- publications), one PostgreSQL database. A revision's dataset is a json
-- column, not jsonb: jsonb reorders keys, and the export must serialize the
-- author's dataset byte for byte the way it was written (EXP-001).
--
-- Append-only is enforced twice: no adapter code updates or deletes a
-- revision, and the trigger below refuses it at the database, so even a
-- direct connection as the owner role cannot rewrite history (STORE-001).
CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    title text NOT NULL,
    shelf_state text NOT NULL CHECK (shelf_state IN ('ephemeral', 'draft', 'published')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
    session_id text NOT NULL REFERENCES sessions(id),
    number integer NOT NULL CHECK (number > 0),
    dataset json NOT NULL,
    note text NOT NULL DEFAULT '',
    door text NOT NULL CHECK (door IN ('ui', 'api', 'mcp')),
    author text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL,
    PRIMARY KEY (session_id, number)
);

CREATE TABLE IF NOT EXISTS runs (
    id text PRIMARY KEY,
    session_id text NOT NULL REFERENCES sessions(id),
    revision integer NOT NULL,
    kind text NOT NULL CHECK (kind IN ('rehearsal', 'session')),
    state text NOT NULL CHECK (state IN ('live', 'closed')),
    capture jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL,
    closed_at timestamptz,
    artifact bytea,
    artifact_sha256 text,
    renderer text,
    FOREIGN KEY (session_id, revision) REFERENCES revisions(session_id, number)
);

CREATE TABLE IF NOT EXISTS publications (
    id text PRIMARY KEY,
    session_id text NOT NULL REFERENCES sessions(id),
    revision integer NOT NULL,
    repository text NOT NULL,
    ref text NOT NULL,
    path text NOT NULL,
    commit_sha text NOT NULL,
    sha256 text NOT NULL,
    renderer text NOT NULL,
    published_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION revisions_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'revisions are append-only: % refused on revision % of %', TG_OP, OLD.number, OLD.session_id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS revisions_append_only ON revisions;
CREATE TRIGGER revisions_append_only
    BEFORE UPDATE OR DELETE ON revisions
    FOR EACH ROW EXECUTE FUNCTION revisions_append_only();

-- A closed run is immutable (RUN-004): the workshop stands as run.
CREATE OR REPLACE FUNCTION runs_frozen_once_closed() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'runs are never deleted: % refused', OLD.id;
    END IF;
    IF OLD.state = 'closed' THEN
        RAISE EXCEPTION 'run % is closed: the workshop stands as run', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runs_frozen_once_closed ON runs;
CREATE TRIGGER runs_frozen_once_closed
    BEFORE UPDATE OR DELETE ON runs
    FOR EACH ROW EXECUTE FUNCTION runs_frozen_once_closed();

-- The shelf lifecycle runs forward only (STORE-002): ephemeral, draft, published.
CREATE OR REPLACE FUNCTION sessions_forward_only() RETURNS trigger AS $$
DECLARE
    old_rank integer := array_position(ARRAY['ephemeral', 'draft', 'published'], OLD.shelf_state);
    new_rank integer := array_position(ARRAY['ephemeral', 'draft', 'published'], NEW.shelf_state);
BEGIN
    IF new_rank < old_rank THEN
        RAISE EXCEPTION 'shelf state runs forward only: % to % refused on %', OLD.shelf_state, NEW.shelf_state, OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sessions_forward_only ON sessions;
CREATE TRIGGER sessions_forward_only
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION sessions_forward_only();
