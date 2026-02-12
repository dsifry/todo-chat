// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import Database from "better-sqlite3";
import { initializeDatabase } from "../db/schema.js";
import { createQueries } from "../db/queries.js";
import { TodoService } from "../services/todo.js";
import { createTodoRouter } from "./todos.js";

describe("Todo REST API Routes", () => {
  let app: express.Express;
  let db: Database.Database;
  let service: TodoService;

  beforeEach(() => {
    db = initializeDatabase(":memory:");
    const queries = createQueries(db);
    service = new TodoService(queries);

    app = express();
    app.use(express.json());
    app.use("/api/todos", createTodoRouter(service));

    // Global error handler for unhandled errors
    app.use(
      (
        err: Error & { status?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        const statusCode = err.status ?? 500;
        res.status(statusCode).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err.message,
          },
        });
      },
    );
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // GET /api/todos
  // ---------------------------------------------------------------------------

  describe("GET /api/todos", () => {
    it("returns 200 with an empty array when no todos exist", async () => {
      const res = await request(app).get("/api/todos");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 200 with todos as JSON array", async () => {
      service.create("Buy groceries");
      service.create("Walk the dog");

      const res = await request(app).get("/api/todos");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      const titles = (res.body as Array<{ title: string }>).map(
        (t) => t.title,
      );
      expect(titles).toContain("Buy groceries");
      expect(titles).toContain("Walk the dog");

      for (const todo of res.body as Array<{ completed: boolean }>) {
        expect(todo.completed).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/todos
  // ---------------------------------------------------------------------------

  describe("POST /api/todos", () => {
    it("returns 201 with the created todo", async () => {
      const res = await request(app)
        .post("/api/todos")
        .send({ title: "Buy groceries" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        title: "Buy groceries",
        completed: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app).post("/api/todos").send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: expect.any(String),
        },
      });
    });

    it("returns 400 when title is empty string", async () => {
      const res = await request(app)
        .post("/api/todos")
        .send({ title: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when title is only whitespace", async () => {
      const res = await request(app)
        .post("/api/todos")
        .send({ title: "   " });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when title exceeds 500 characters", async () => {
      const res = await request(app)
        .post("/api/todos")
        .send({ title: "x".repeat(501) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("trims whitespace from the title", async () => {
      const res = await request(app)
        .post("/api/todos")
        .send({ title: "  Buy groceries  " });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("Buy groceries");
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/todos/:id
  // ---------------------------------------------------------------------------

  describe("PATCH /api/todos/:id", () => {
    it("returns 200 with the updated todo when updating title", async () => {
      const todo = service.create("Buy groceries");

      const res = await request(app)
        .patch(`/api/todos/${todo.id}`)
        .send({ title: "Buy organic groceries" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: todo.id,
        title: "Buy organic groceries",
        completed: false,
      });
    });

    it("returns 200 with the updated todo when updating completed", async () => {
      const todo = service.create("Buy groceries");

      const res = await request(app)
        .patch(`/api/todos/${todo.id}`)
        .send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: todo.id,
        title: "Buy groceries",
        completed: true,
      });
    });

    it("returns 200 when updating both title and completed", async () => {
      const todo = service.create("Buy groceries");

      const res = await request(app)
        .patch(`/api/todos/${todo.id}`)
        .send({ title: "Buy organic groceries", completed: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: todo.id,
        title: "Buy organic groceries",
        completed: true,
      });
    });

    it("returns 404 when todo does not exist", async () => {
      const res = await request(app)
        .patch("/api/todos/999")
        .send({ title: "Updated" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: expect.any(String),
        },
      });
    });

    it("returns 400 when id is not a valid integer", async () => {
      const res = await request(app)
        .patch("/api/todos/abc")
        .send({ title: "Updated" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: expect.any(String),
        },
      });
    });

    it("returns 400 when title is empty string", async () => {
      const todo = service.create("Buy groceries");

      const res = await request(app)
        .patch(`/api/todos/${todo.id}`)
        .send({ title: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when title exceeds 500 characters", async () => {
      const todo = service.create("Buy groceries");

      const res = await request(app)
        .patch(`/api/todos/${todo.id}`)
        .send({ title: "x".repeat(501) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/todos/:id
  // ---------------------------------------------------------------------------

  describe("DELETE /api/todos/:id", () => {
    it("returns 204 with no body when deleting an existing todo", async () => {
      const todo = service.create("Buy groceries");

      const res = await request(app).delete(`/api/todos/${todo.id}`);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it("actually removes the todo from the database", async () => {
      const todo = service.create("Buy groceries");

      await request(app).delete(`/api/todos/${todo.id}`);

      const listRes = await request(app).get("/api/todos");
      expect(listRes.body).toHaveLength(0);
    });

    it("returns 404 when todo does not exist", async () => {
      const res = await request(app).delete("/api/todos/999");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: expect.any(String),
        },
      });
    });

    it("returns 400 when id is not a valid integer", async () => {
      const res = await request(app).delete("/api/todos/abc");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: expect.any(String),
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Unexpected error propagation
  // ---------------------------------------------------------------------------

  describe("unexpected errors", () => {
    it("propagates unexpected errors from create to the error handler", async () => {
      vi.spyOn(service, "create").mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const res = await request(app)
        .post("/api/todos")
        .send({ title: "Test" });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");

      vi.restoreAllMocks();
    });

    it("propagates unexpected errors from update to the error handler", async () => {
      const todo = service.create("Test");
      vi.spyOn(service, "update").mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const res = await request(app)
        .patch(`/api/todos/${todo.id}`)
        .send({ title: "Updated" });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");

      vi.restoreAllMocks();
    });

    it("propagates unexpected errors from delete to the error handler", async () => {
      const todo = service.create("Test");
      vi.spyOn(service, "delete").mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const res = await request(app).delete(`/api/todos/${todo.id}`);

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");

      vi.restoreAllMocks();
    });
  });
});
