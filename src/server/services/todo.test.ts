// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { initializeDatabase } from "../db/schema.js";
import { createQueries } from "../db/queries.js";
import { TodoService, NotFoundError, ValidationError } from "./todo.js";

describe("TodoService", () => {
  let db: Database.Database;
  let service: TodoService;

  beforeEach(() => {
    db = initializeDatabase(":memory:");
    const queries = createQueries(db);
    service = new TodoService(queries);
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // getAll
  // ---------------------------------------------------------------------------

  describe("getAll", () => {
    it("returns an empty array when no todos exist", () => {
      const todos = service.getAll();
      expect(todos).toEqual([]);
    });

    it("returns all todos", () => {
      service.create("First todo");
      service.create("Second todo");

      const todos = service.getAll();
      expect(todos).toHaveLength(2);
      const titles = todos.map((t) => t.title);
      expect(titles).toContain("First todo");
      expect(titles).toContain("Second todo");
    });
  });

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  describe("getById", () => {
    it("returns a todo by its id", () => {
      const created = service.create("My todo");
      const found = service.getById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe("My todo");
      expect(found.completed).toBe(false);
    });

    it("throws NotFoundError when todo does not exist", () => {
      expect(() => service.getById(999)).toThrow(NotFoundError);
      expect(() => service.getById(999)).toThrow("Todo with id 999 not found");
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    it("creates a todo with a valid title", () => {
      const todo = service.create("Buy groceries");
      expect(todo.id).toBeGreaterThan(0);
      expect(todo.title).toBe("Buy groceries");
      expect(todo.completed).toBe(false);
      expect(todo.createdAt).toBeDefined();
      expect(todo.updatedAt).toBeDefined();
    });

    it("trims whitespace from the title", () => {
      const todo = service.create("  trimmed title  ");
      expect(todo.title).toBe("trimmed title");
    });

    it("throws ValidationError for an empty title", () => {
      expect(() => service.create("")).toThrow(ValidationError);
    });

    it("throws ValidationError for a whitespace-only title", () => {
      expect(() => service.create("   ")).toThrow(ValidationError);
    });

    it("throws ValidationError for a title exceeding 500 characters", () => {
      const longTitle = "a".repeat(501);
      expect(() => service.create(longTitle)).toThrow(ValidationError);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe("update", () => {
    it("updates the title of a todo", () => {
      const created = service.create("Original");
      const updated = service.update(created.id, { title: "Updated" });
      expect(updated.title).toBe("Updated");
    });

    it("updates the completed status of a todo", () => {
      const created = service.create("Task");
      const updated = service.update(created.id, { completed: true });
      expect(updated.completed).toBe(true);
    });

    it("updates both title and completed at once", () => {
      const created = service.create("Task");
      const updated = service.update(created.id, {
        title: "Done task",
        completed: true,
      });
      expect(updated.title).toBe("Done task");
      expect(updated.completed).toBe(true);
    });

    it("returns the unchanged todo when no fields are provided", () => {
      const created = service.create("Unchanged");
      const updated = service.update(created.id, {});
      expect(updated.title).toBe("Unchanged");
      expect(updated.completed).toBe(false);
    });

    it("throws NotFoundError when todo does not exist", () => {
      expect(() => service.update(999, { title: "Nope" })).toThrow(
        NotFoundError,
      );
      expect(() => service.update(999, { title: "Nope" })).toThrow(
        "Todo with id 999 not found",
      );
    });

    it("throws ValidationError for an invalid title on update", () => {
      const created = service.create("Valid");
      expect(() => service.update(created.id, { title: "" })).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError for a title exceeding 500 characters on update", () => {
      const created = service.create("Valid");
      const longTitle = "a".repeat(501);
      expect(() => service.update(created.id, { title: longTitle })).toThrow(
        ValidationError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------

  describe("search", () => {
    it("returns todos matching the query", () => {
      service.create("Buy groceries");
      service.create("Walk the dog");
      service.create("Buy milk");

      const results = service.search("Buy");
      expect(results).toHaveLength(2);
      const titles = results.map((t) => t.title);
      expect(titles).toContain("Buy groceries");
      expect(titles).toContain("Buy milk");
    });

    it("returns empty array when nothing matches", () => {
      service.create("Buy groceries");
      const results = service.search("exercise");
      expect(results).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe("delete", () => {
    it("deletes an existing todo", () => {
      const created = service.create("To delete");
      service.delete(created.id);
      expect(() => service.getById(created.id)).toThrow(NotFoundError);
    });

    it("throws NotFoundError when todo does not exist", () => {
      expect(() => service.delete(999)).toThrow(NotFoundError);
      expect(() => service.delete(999)).toThrow(
        "Todo with id 999 not found",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error types
  // ---------------------------------------------------------------------------

  describe("error types", () => {
    it("NotFoundError is an instance of Error", () => {
      const err = new NotFoundError("test");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.name).toBe("NotFoundError");
    });

    it("ValidationError is an instance of Error", () => {
      const err = new ValidationError("test");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.name).toBe("ValidationError");
    });
  });
});
