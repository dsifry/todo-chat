import Database from "better-sqlite3";
import type { Todo, ChatMessage, TodoSuggestion } from "../../shared/types.js";

// ---------------------------------------------------------------------------
// Raw SQLite row types (snake_case, INTEGER booleans)
// ---------------------------------------------------------------------------

interface TodoRow {
  id: number;
  title: string;
  completed: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  session_id: string;
  created_at: string;
}

interface TodoSuggestionRow {
  id: number;
  chat_message_id: number;
  title: string;
  accepted: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain mappers
// ---------------------------------------------------------------------------

function mapTodoRow(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChatMessageRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function mapTodoSuggestionRow(row: TodoSuggestionRow): TodoSuggestion {
  return {
    id: row.id,
    chatMessageId: row.chat_message_id,
    title: row.title,
    accepted: row.accepted === 1,
  };
}

// ---------------------------------------------------------------------------
// Query factory — accepts an injected Database instance
// ---------------------------------------------------------------------------

export function createQueries(db: Database.Database) {
  return {
    // -- Todos --------------------------------------------------------------

    getAllTodos(): Todo[] {
      const rows = db
        .prepare("SELECT * FROM todos ORDER BY created_at DESC")
        .all() as TodoRow[];
      return rows.map(mapTodoRow);
    },

    getTodoById(id: number): Todo | undefined {
      const row = db
        .prepare("SELECT * FROM todos WHERE id = ?")
        .get(id) as TodoRow | undefined;
      return row ? mapTodoRow(row) : undefined;
    },

    createTodo(title: string): Todo {
      const result = db
        .prepare("INSERT INTO todos (title) VALUES (?)")
        .run(title);
      return this.getTodoById(Number(result.lastInsertRowid))!;
    },

    updateTodo(
      id: number,
      updates: { title?: string; completed?: boolean },
    ): Todo | undefined {
      const todo = this.getTodoById(id);
      if (!todo) return undefined;

      const fields: string[] = [];
      const values: (string | number)[] = [];

      if (updates.title !== undefined) {
        fields.push("title = ?");
        values.push(updates.title);
      }
      if (updates.completed !== undefined) {
        fields.push("completed = ?");
        values.push(updates.completed ? 1 : 0);
      }

      if (fields.length === 0) return todo;

      fields.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(
        `UPDATE todos SET ${fields.join(", ")} WHERE id = ?`,
      ).run(...values);

      return this.getTodoById(id)!;
    },

    deleteTodo(id: number): boolean {
      const result = db.prepare("DELETE FROM todos WHERE id = ?").run(id);
      return result.changes > 0;
    },

    // -- Chat Sessions -------------------------------------------------------

    getCurrentSessionId(): string {
      const row = db
        .prepare(
          "SELECT id FROM chat_sessions ORDER BY rowid DESC LIMIT 1",
        )
        .get() as { id: string } | undefined;
      return row?.id ?? "default";
    },

    startNewSession(): string {
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO chat_sessions (id) VALUES (?)").run(id);
      return id;
    },

    // -- Chat Messages ------------------------------------------------------

    getChatHistory(): ChatMessage[] {
      const sessionId = this.getCurrentSessionId();
      const rows = db
        .prepare(
          "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
        )
        .all(sessionId) as ChatMessageRow[];
      return rows.map(mapChatMessageRow);
    },

    createChatMessage(role: "user" | "assistant", content: string): ChatMessage {
      const sessionId = this.getCurrentSessionId();
      const result = db
        .prepare(
          "INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)",
        )
        .run(role, content, sessionId);
      const row = db
        .prepare("SELECT * FROM chat_messages WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as ChatMessageRow;
      return mapChatMessageRow(row);
    },

    // -- Todo Suggestions ---------------------------------------------------

    createTodoSuggestion(
      chatMessageId: number,
      title: string,
    ): TodoSuggestion {
      const result = db
        .prepare(
          "INSERT INTO todo_suggestions (chat_message_id, title) VALUES (?, ?)",
        )
        .run(chatMessageId, title);
      const row = db
        .prepare("SELECT * FROM todo_suggestions WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as TodoSuggestionRow;
      return mapTodoSuggestionRow(row);
    },

    clearChatHistory(): void {
      // Start a new session — old messages are preserved but won't appear
      // in getChatHistory() since it filters by the current (latest) session.
      this.startNewSession();
    },

    searchTodos(query: string): Todo[] {
      const rows = db
        .prepare(
          "SELECT * FROM todos WHERE title LIKE ? ORDER BY created_at DESC",
        )
        .all(`%${query}%`) as TodoRow[];
      return rows.map(mapTodoRow);
    },

    acceptTodoSuggestion(id: number): TodoSuggestion | undefined {
      const result = db
        .prepare("UPDATE todo_suggestions SET accepted = 1 WHERE id = ?")
        .run(id);
      if (result.changes === 0) return undefined;
      const row = db
        .prepare("SELECT * FROM todo_suggestions WHERE id = ?")
        .get(id) as TodoSuggestionRow;
      return mapTodoSuggestionRow(row);
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;
