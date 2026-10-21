ALTER TABLE hosts ADD COLUMN library_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hosts ADD COLUMN plan_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE mutation_assertions(id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok = 1));
CREATE TABLE text_chunks(ref TEXT NOT NULL, owner TEXT NOT NULL, ordinal INTEGER NOT NULL, value TEXT NOT NULL, digest TEXT NOT NULL, chunk_count INTEGER NOT NULL, PRIMARY KEY(ref, ordinal));
CREATE TABLE mutation_stages(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES hosts(id), expected_chunks INTEGER NOT NULL, expected_rows INTEGER NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL, sealed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE mutation_chunks(stage_id TEXT NOT NULL REFERENCES mutation_stages(id), ordinal INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(stage_id, ordinal));
CREATE TABLE session_tombstones(id TEXT PRIMARY KEY, revoked_at INTEGER NOT NULL);
CREATE TABLE notion_leases(host_id TEXT PRIMARY KEY REFERENCES hosts(id), token TEXT NOT NULL, expires INTEGER NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE abuse_windows(key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TABLE mutation_receipts(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE operation_receipts(host_id TEXT NOT NULL REFERENCES hosts(id), key TEXT NOT NULL, scope TEXT NOT NULL, digest TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(host_id,key,scope));
CREATE TABLE anonymous_operation_receipts(key_hash TEXT PRIMARY KEY, digest TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_login_sessions_expires ON login_sessions(expires);
-- Published references must remain valid after library edits and snapshot copies.
-- Orphan reclamation is deliberately separate from the request path.
CREATE TRIGGER text_chunks_no_update BEFORE UPDATE ON text_chunks BEGIN SELECT RAISE(ABORT, 'Immutable text chunks'); END;
CREATE TRIGGER text_chunks_no_delete BEFORE DELETE ON text_chunks BEGIN SELECT RAISE(ABORT, 'Immutable text chunks'); END;
CREATE TRIGGER mutation_chunks_no_update BEFORE UPDATE ON mutation_chunks BEGIN SELECT RAISE(ABORT, 'Immutable staged chunks'); END;
