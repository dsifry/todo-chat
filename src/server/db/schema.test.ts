// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "./schema.js";

describe("initializeDatabase", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it("returns a database instance when given :memory:", () => {
    db = initializeDatabase(":memory:");
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it("enables WAL journal mode on file-based databases", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wal-test-"));
    const dbPath = path.join(tmpDir, "wal-test.db");

    try {
      db = initializeDatabase(dbPath);
      const result = db.pragma("journal_mode") as { journal_mode: string }[];
      expect(result[0]?.journal_mode).toBe("wal");
      db.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("enables foreign key enforcement", () => {
    db = initializeDatabase(":memory:");
    const result = db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0]?.foreign_keys).toBe(1);
  });

  describe("todos table", () => {
    it("exists with correct columns", () => {
      db = initializeDatabase(":memory:");
      const columns = db.pragma("table_info(todos)") as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toEqual([
        "id",
        "title",
        "completed",
        "created_at",
        "updated_at",
      ]);

      const idCol = columns.find((c) => c.name === "id");
      expect(idCol?.type).toBe("INTEGER");
      expect(idCol?.pk).toBe(1);

      const titleCol = columns.find((c) => c.name === "title");
      expect(titleCol?.type).toBe("TEXT");
      expect(titleCol?.notnull).toBe(1);

      const completedCol = columns.find((c) => c.name === "completed");
      expect(completedCol?.type).toBe("INTEGER");
      expect(completedCol?.notnull).toBe(1);
      expect(completedCol?.dflt_value).toBe("0");

      const createdAtCol = columns.find((c) => c.name === "created_at");
      expect(createdAtCol?.type).toBe("TEXT");
      expect(createdAtCol?.notnull).toBe(1);
      expect(createdAtCol?.dflt_value).toBe("datetime('now')");

      const updatedAtCol = columns.find((c) => c.name === "updated_at");
      expect(updatedAtCol?.type).toBe("TEXT");
      expect(updatedAtCol?.notnull).toBe(1);
      expect(updatedAtCol?.dflt_value).toBe("datetime('now')");
    });

    it("supports inserting and retrieving a todo", () => {
      db = initializeDatabase(":memory:");
      db.prepare("INSERT INTO todos (title) VALUES (?)").run("Buy groceries");
      const row = db.prepare("SELECT * FROM todos WHERE id = 1").get() as {
        id: number;
        title: string;
        completed: number;
        created_at: string;
        updated_at: string;
      };
      expect(row.title).toBe("Buy groceries");
      expect(row.completed).toBe(0);
      expect(row.created_at).toBeDefined();
      expect(row.updated_at).toBeDefined();
    });
  });

  describe("chat_sessions table", () => {
    it("exists with correct columns", () => {
      db = initializeDatabase(":memory:");
      const columns = db.pragma("table_info(chat_sessions)") as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toEqual(["id", "created_at"]);

      const idCol = columns.find((c) => c.name === "id");
      expect(idCol?.type).toBe("TEXT");
      expect(idCol?.pk).toBe(1);
    });

    it("creates a default session on initialization", () => {
      db = initializeDatabase(":memory:");
      const row = db
        .prepare("SELECT id FROM chat_sessions WHERE id = 'default'")
        .get() as { id: string } | undefined;
      expect(row?.id).toBe("default");
    });
  });

  describe("chat_messages table", () => {
    it("exists with correct columns", () => {
      db = initializeDatabase(":memory:");
      const columns = db.pragma("table_info(chat_messages)") as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toEqual([
        "id",
        "role",
        "content",
        "session_id",
        "created_at",
      ]);

      const idCol = columns.find((c) => c.name === "id");
      expect(idCol?.type).toBe("INTEGER");
      expect(idCol?.pk).toBe(1);

      const roleCol = columns.find((c) => c.name === "role");
      expect(roleCol?.type).toBe("TEXT");
      expect(roleCol?.notnull).toBe(1);

      const contentCol = columns.find((c) => c.name === "content");
      expect(contentCol?.type).toBe("TEXT");
      expect(contentCol?.notnull).toBe(1);

      const createdAtCol = columns.find((c) => c.name === "created_at");
      expect(createdAtCol?.type).toBe("TEXT");
      expect(createdAtCol?.notnull).toBe(1);
      expect(createdAtCol?.dflt_value).toBe("datetime('now')");
    });

    it("accepts 'user' as a valid role", () => {
      db = initializeDatabase(":memory:");
      expect(() => {
        db.prepare(
          "INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)"
        ).run("user", "Hello", "default");
      }).not.toThrow();
    });

    it("accepts 'assistant' as a valid role", () => {
      db = initializeDatabase(":memory:");
      expect(() => {
        db.prepare(
          "INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)"
        ).run("assistant", "Hi there!", "default");
      }).not.toThrow();
    });

    it("rejects invalid role values via CHECK constraint", () => {
      db = initializeDatabase(":memory:");
      expect(() => {
        db.prepare(
          "INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)"
        ).run("system", "Not allowed", "default");
      }).toThrow();
    });

    it("enforces foreign key constraint on session_id", () => {
      db = initializeDatabase(":memory:");
      expect(() => {
        db.prepare(
          "INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)"
        ).run("user", "Hello", "nonexistent-session");
      }).toThrow();
    });
  });

  describe("todo_suggestions table", () => {
    it("exists with correct columns", () => {
      db = initializeDatabase(":memory:");
      const columns = db.pragma("table_info(todo_suggestions)") as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toEqual([
        "id",
        "chat_message_id",
        "title",
        "accepted",
        "created_at",
      ]);

      const idCol = columns.find((c) => c.name === "id");
      expect(idCol?.type).toBe("INTEGER");
      expect(idCol?.pk).toBe(1);

      const chatMessageIdCol = columns.find(
        (c) => c.name === "chat_message_id"
      );
      expect(chatMessageIdCol?.type).toBe("INTEGER");
      expect(chatMessageIdCol?.notnull).toBe(1);

      const titleCol = columns.find((c) => c.name === "title");
      expect(titleCol?.type).toBe("TEXT");
      expect(titleCol?.notnull).toBe(1);

      const acceptedCol = columns.find((c) => c.name === "accepted");
      expect(acceptedCol?.type).toBe("INTEGER");
      expect(acceptedCol?.notnull).toBe(1);
      expect(acceptedCol?.dflt_value).toBe("0");

      const createdAtCol = columns.find((c) => c.name === "created_at");
      expect(createdAtCol?.type).toBe("TEXT");
      expect(createdAtCol?.notnull).toBe(1);
      expect(createdAtCol?.dflt_value).toBe("datetime('now')");
    });

    it("allows inserting a suggestion linked to an existing chat message", () => {
      db = initializeDatabase(":memory:");
      db.prepare(
        "INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)"
      ).run("assistant", "How about this todo?", "default");
      expect(() => {
        db.prepare(
          "INSERT INTO todo_suggestions (chat_message_id, title) VALUES (?, ?)"
        ).run(1, "Suggested todo");
      }).not.toThrow();
    });

    it("enforces foreign key constraint on chat_message_id", () => {
      db = initializeDatabase(":memory:");
      expect(() => {
        db.prepare(
          "INSERT INTO todo_suggestions (chat_message_id, title) VALUES (?, ?)"
        ).run(999, "Orphaned suggestion");
      }).toThrow();
    });
  });

  describe("idempotent initialization", () => {
    it("does not throw when called twice on the same database", () => {
      db = initializeDatabase(":memory:");
      // Insert some data in the first initialization
      db.prepare("INSERT INTO todos (title) VALUES (?)").run("Existing todo");

      // Re-run initialization on the same db object by calling exec again
      // Since we can't re-initialize the same :memory: db via initializeDatabase,
      // we verify the CREATE TABLE IF NOT EXISTS behavior by running the SQL again
      expect(() => {
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
      }).not.toThrow();

      // Verify existing data is preserved
      const row = db.prepare("SELECT * FROM todos WHERE id = 1").get() as {
        title: string;
      };
      expect(row.title).toBe("Existing todo");
    });

    it("works when initializeDatabase is called with a file-based db path twice", async () => {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-test-"));
      const dbPath = path.join(tmpDir, "test.db");

      try {
        const db1 = initializeDatabase(dbPath);
        db1.prepare("INSERT INTO todos (title) VALUES (?)").run("Persist me");
        db1.close();

        const db2 = initializeDatabase(dbPath);
        const row = db2.prepare("SELECT * FROM todos WHERE id = 1").get() as {
          title: string;
        };
        expect(row.title).toBe("Persist me");
        db2.close();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("table listing", () => {
    it("creates exactly 4 tables", () => {
      db = initializeDatabase(":memory:");
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as { name: string }[];

      expect(tables.map((t) => t.name)).toEqual([
        "chat_messages",
        "chat_sessions",
        "todo_suggestions",
        "todos",
      ]);
    });
  });
});
