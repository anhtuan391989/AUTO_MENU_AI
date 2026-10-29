CREATE TABLE IF NOT EXISTS song_keys (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT DEFAULT 'provisional',
    total_weight REAL DEFAULT 0,
    confirmed_at INTEGER
);

CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL,
    key TEXT NOT NULL,
    mode TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    source TEXT DEFAULT 'user',
    ip_hash TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (song_id) REFERENCES song_keys(id)
);

CREATE INDEX IF NOT EXISTS idx_song_id ON votes(song_id);
CREATE INDEX IF NOT EXISTS idx_ip ON votes(ip_hash);