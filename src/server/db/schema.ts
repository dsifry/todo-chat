import Database from "better-sqlite3";

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Enable WAL mode for concurrent read/write
  db.pragma("journal_mode = WAL");

  // Enable foreign key enforcement
  db.pragma("foreign_keys = ON");

  // Create tables (idempotent with IF NOT EXISTS)
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todo_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_message_id INTEGER NOT NULL REFERENCES chat_messages(id),
      title TEXT NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure a default session exists
  db.prepare(
    "INSERT OR IGNORE INTO chat_sessions (id) VALUES (?)",
  ).run("default");

  // Migrate: add session_id to existing chat_messages tables that lack it
  const columns = db.pragma("table_info(chat_messages)") as { name: string }[];
  const hasSessionId = columns.some((c) => c.name === "session_id");
  if (!hasSessionId) {
    db.exec(`
      ALTER TABLE chat_messages ADD COLUMN session_id TEXT REFERENCES chat_sessions(id);
      UPDATE chat_messages SET session_id = 'default' WHERE session_id IS NULL;
    `);
  }

  return db;
}
