import { Router, Request, Response } from "express";
import {
  TodoService,
  NotFoundError,
  ValidationError,
} from "../services/todo.js";

/**
 * Parse a route parameter as a positive integer.
 * Returns the parsed number or NaN if invalid.
 */
function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id !== Number(raw)) {
    return NaN;
  }
  return id;
}

/**
 * Factory function that creates an Express Router for todo CRUD endpoints.
 * Uses dependency injection — receives a TodoService instance.
 *
 * Intended to be mounted at `/api/todos`.
 */
export function createTodoRouter(service: TodoService): Router {
  const router = Router();

  // GET / — list all todos
  router.get("/", (_req: Request, res: Response) => {
    const todos = service.getAll();
    res.json(todos);
  });

  // POST / — create a new todo
  router.post("/", (req: Request, res: Response) => {
    try {
      const { title } = req.body as { title?: string };
      const todo = service.create(title ?? "");
      res.status(201).json(todo);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: err.message },
        });
        return;
      }
      throw err;
    }
  });

  // PATCH /:id — update an existing todo
  router.patch("/:id", (req: Request, res: Response) => {
    const id = parseId(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid todo id: must be an integer",
        },
      });
      return;
    }

    try {
      const updates = req.body as { title?: string; completed?: boolean };
      const todo = service.update(id, updates);
      res.json(todo);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
        return;
      }
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: err.message },
        });
        return;
      }
      throw err;
    }
  });

  // DELETE /:id — delete a todo
  router.delete("/:id", (req: Request, res: Response) => {
    const id = parseId(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid todo id: must be an integer",
        },
      });
      return;
    }

    try {
      service.delete(id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
        return;
      }
      throw err;
    }
  });

  return router;
}
