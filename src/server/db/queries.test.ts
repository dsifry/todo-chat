// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { initializeDatabase } from "./schema.js";
import { createQueries } from "./queries.js";
import type { Queries } from "./queries.js";

describe("createQueries", () => {
  let db: Database.Database;
  let queries: Queries;

  beforeEach(() => {
    db = initializeDatabase(":memory:");
    queries = createQueries(db);
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // Todo CRUD
  // ---------------------------------------------------------------------------
  describe("todos", () => {
    it("getAllTodos returns empty array initially", () => {
      const todos = queries.getAllTodos();
      expect(todos).toEqual([]);
    });

    it("createTodo returns todo with correct fields", () => {
      const todo = queries.createTodo("Buy groceries");
      expect(todo).toMatchObject({
        id: expect.any(Number) as number,
        title: "Buy groceries",
        completed: false,
      });
      expect(typeof todo.createdAt).toBe("string");
      expect(typeof todo.updatedAt).toBe("string");
    });

    it("getAllTodos returns todos in created_at DESC order", () => {
      // Insert with explicit timestamps to guarantee ordering
      db.prepare(
        "INSERT INTO todos (title, created_at, updated_at) VALUES (?, datetime('now', '-2 seconds'), datetime('now', '-2 seconds'))",
      ).run("First");
      db.prepare(
        "INSERT INTO todos (title, created_at, updated_at) VALUES (?, datetime('now', '-1 seconds'), datetime('now', '-1 seconds'))",
      ).run("Second");
      db.prepare(
        "INSERT INTO todos (title, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))",
      ).run("Third");

      const todos = queries.getAllTodos();
      expect(todos).toHaveLength(3);
      expect(todos[0]!.title).toBe("Third");
      expect(todos[1]!.title).toBe("Second");
      expect(todos[2]!.title).toBe("First");
    });

    it("getTodoById returns the correct todo", () => {
      const created = queries.createTodo("Test todo");
      const found = queries.getTodoById(created.id);
      expect(found).toEqual(created);
    });

    it("getTodoById returns undefined for non-existent id", () => {
      const found = queries.getTodoById(999);
      expect(found).toBeUndefined();
    });

    it("updateTodo updates title", () => {
      const created = queries.createTodo("Old title");
      const updated = queries.updateTodo(created.id, { title: "New title" });
      expect(updated).toBeDefined();
      expect(updated!.title).toBe("New title");
      expect(updated!.completed).toBe(false);
    });

    it("updateTodo updates completed status", () => {
      const created = queries.createTodo("A task");
      const updated = queries.updateTodo(created.id, { completed: true });
      expect(updated).toBeDefined();
      expect(updated!.completed).toBe(true);
    });

    it("updateTodo updates updated_at timestamp", () => {
      // Insert with an old timestamp so we can detect the change
      db.prepare(
        "INSERT INTO todos (title, created_at, updated_at) VALUES (?, datetime('now', '-10 seconds'), datetime('now', '-10 seconds'))",
      ).run("Old timestamp");
      const allBefore = queries.getAllTodos();
      const todo = allBefore[0]!;
      const oldUpdatedAt = todo.updatedAt;

      const updated = queries.updateTodo(todo.id, { title: "Changed" });
      expect(updated).toBeDefined();
      expect(updated!.updatedAt).not.toBe(oldUpdatedAt);
    });

    it("updateTodo returns undefined for non-existent id", () => {
      const result = queries.updateTodo(999, { title: "Nope" });
      expect(result).toBeUndefined();
    });

    it("deleteTodo returns true and removes the todo", () => {
      const created = queries.createTodo("To delete");
      const deleted = queries.deleteTodo(created.id);
      expect(deleted).toBe(true);

      const found = queries.getTodoById(created.id);
      expect(found).toBeUndefined();
    });

    it("deleteTodo returns false for non-existent id", () => {
      const deleted = queries.deleteTodo(999);
      expect(deleted).toBe(false);
    });

    it("updateTodo with completed=false stores 0 and maps back to false", () => {
      const created = queries.createTodo("Toggle me");
      queries.updateTodo(created.id, { completed: true });
      const updated = queries.updateTodo(created.id, { completed: false });
      expect(updated).toBeDefined();
      expect(updated!.completed).toBe(false);
    });

    it("updateTodo with empty updates returns unchanged todo", () => {
      const created = queries.createTodo("No changes");
      const updated = queries.updateTodo(created.id, {});
      expect(updated).toBeDefined();
      expect(updated!.title).toBe("No changes");
      expect(updated!.completed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Chat Sessions
  // ---------------------------------------------------------------------------
  describe("chat sessions", () => {
    it("getCurrentSessionId returns 'default' initially", () => {
      const sessionId = queries.getCurrentSessionId();
      expect(sessionId).toBe("default");
    });

    it("startNewSession returns a new session id", () => {
      const sessionId = queries.startNewSession();
      expect(sessionId).toBeTruthy();
      expect(sessionId).not.toBe("default");
    });

    it("getCurrentSessionId returns the latest session", () => {
      const newId = queries.startNewSession();
      expect(queries.getCurrentSessionId()).toBe(newId);
    });
  });

  // ---------------------------------------------------------------------------
  // Chat Messages
  // ---------------------------------------------------------------------------
  describe("chat messages", () => {
    it("getChatHistory returns empty array initially", () => {
      const messages = queries.getChatHistory();
      expect(messages).toEqual([]);
    });

    it("createChatMessage creates user message with correct fields", () => {
      const msg = queries.createChatMessage("user", "Hello");
      expect(msg).toMatchObject({
        id: expect.any(Number) as number,
        role: "user",
        content: "Hello",
      });
      expect(typeof msg.createdAt).toBe("string");
    });

    it("createChatMessage creates assistant message", () => {
      const msg = queries.createChatMessage("assistant", "Hi there!");
      expect(msg.role).toBe("assistant");
      expect(msg.content).toBe("Hi there!");
    });

    it("getChatHistory returns messages in created_at ASC order", () => {
      queries.createChatMessage("user", "First");
      queries.createChatMessage("assistant", "Second");
      queries.createChatMessage("user", "Third");

      const messages = queries.getChatHistory();
      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).toBe("First");
      expect(messages[1]!.content).toBe("Second");
      expect(messages[2]!.content).toBe("Third");
    });

    it("getChatHistory only returns messages from current session", () => {
      queries.createChatMessage("user", "Old message");
      queries.startNewSession();
      queries.createChatMessage("user", "New message");

      const messages = queries.getChatHistory();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe("New message");
    });

    it("createChatMessage tags message with current session", () => {
      const newSessionId = queries.startNewSession();
      queries.createChatMessage("user", "Session message");

      const row = db
        .prepare("SELECT session_id FROM chat_messages WHERE content = ?")
        .get("Session message") as { session_id: string };
      expect(row.session_id).toBe(newSessionId);
    });
  });

  // ---------------------------------------------------------------------------
  // clearChatHistory
  // ---------------------------------------------------------------------------
  describe("clearChatHistory", () => {
    it("starts a new session so getChatHistory returns empty", () => {
      queries.createChatMessage("user", "Hello");
      queries.createChatMessage("assistant", "Hi there!");

      queries.clearChatHistory();

      expect(queries.getChatHistory()).toEqual([]);
    });

    it("preserves old messages in the database", () => {
      queries.createChatMessage("user", "Hello");

      queries.clearChatHistory();

      const allRows = db
        .prepare("SELECT * FROM chat_messages")
        .all() as { content: string }[];
      expect(allRows).toHaveLength(1);
      expect(allRows[0]!.content).toBe("Hello");
    });

    it("succeeds when no history exists", () => {
      expect(() => queries.clearChatHistory()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // searchTodos
  // ---------------------------------------------------------------------------
  describe("searchTodos", () => {
    it("returns todos matching the query", () => {
      queries.createTodo("Buy groceries");
      queries.createTodo("Walk the dog");
      queries.createTodo("Buy milk");

      const results = queries.searchTodos("Buy");
      expect(results).toHaveLength(2);
      const titles = results.map((t) => t.title);
      expect(titles).toContain("Buy groceries");
      expect(titles).toContain("Buy milk");
    });

    it("returns empty array when nothing matches", () => {
      queries.createTodo("Buy groceries");

      const results = queries.searchTodos("exercise");
      expect(results).toEqual([]);
    });

    it("performs case-insensitive search", () => {
      queries.createTodo("Buy Groceries");

      const results = queries.searchTodos("buy");
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("Buy Groceries");
    });
  });

  // ---------------------------------------------------------------------------
  // Todo Suggestions
  // ---------------------------------------------------------------------------
  describe("todo suggestions", () => {
    let chatMessageId: number;

    beforeEach(() => {
      const msg = queries.createChatMessage("assistant", "How about these?");
      chatMessageId = msg.id;
    });

    it("createTodoSuggestion creates suggestion linked to chat message", () => {
      const suggestion = queries.createTodoSuggestion(
        chatMessageId,
        "Suggested task",
      );
      expect(suggestion.chatMessageId).toBe(chatMessageId);
      expect(suggestion.title).toBe("Suggested task");
    });

    it("createTodoSuggestion returns suggestion with accepted=false", () => {
      const suggestion = queries.createTodoSuggestion(
        chatMessageId,
        "Another suggestion",
      );
      expect(suggestion.accepted).toBe(false);
    });

    it("acceptTodoSuggestion marks suggestion as accepted", () => {
      const suggestion = queries.createTodoSuggestion(
        chatMessageId,
        "Accept me",
      );
      const accepted = queries.acceptTodoSuggestion(suggestion.id);
      expect(accepted).toBeDefined();
      expect(accepted!.accepted).toBe(true);
    });

    it("acceptTodoSuggestion returns undefined for non-existent id", () => {
      const result = queries.acceptTodoSuggestion(999);
      expect(result).toBeUndefined();
    });
  });
});
