import type { Todo } from "../../shared/types.js";
import type { Queries } from "../db/queries.js";
import {
  CreateTodoInputSchema,
  UpdateTodoInputSchema,
} from "../../shared/validation.js";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TodoService {
  private readonly queries: Queries;

  constructor(queries: Queries) {
    this.queries = queries;
  }

  /** Return all todos (ordered by created_at DESC per the query layer). */
  getAll(): Todo[] {
    return this.queries.getAllTodos();
  }

  /** Return a single todo by id, or throw NotFoundError. */
  getById(id: number): Todo {
    const todo = this.queries.getTodoById(id);
    if (!todo) {
      throw new NotFoundError(`Todo with id ${id} not found`);
    }
    return todo;
  }

  /** Validate and create a new todo. Throws ValidationError on bad input. */
  create(title: string): Todo {
    const result = CreateTodoInputSchema.safeParse({ title });
    if (!result.success) {
      throw new ValidationError(result.error.issues[0]!.message);
    }
    return this.queries.createTodo(result.data.title);
  }

  /**
   * Validate and update an existing todo.
   * Throws ValidationError on bad input, NotFoundError if the todo doesn't exist.
   */
  update(id: number, updates: { title?: string; completed?: boolean }): Todo {
    const result = UpdateTodoInputSchema.safeParse({ id, ...updates });
    if (!result.success) {
      throw new ValidationError(result.error.issues[0]!.message);
    }

    const { title, completed } = result.data;
    const todo = this.queries.updateTodo(id, { title, completed });
    if (!todo) {
      throw new NotFoundError(`Todo with id ${id} not found`);
    }
    return todo;
  }

  /** Delete a todo by id. Throws NotFoundError if the todo doesn't exist. */
  delete(id: number): void {
    const deleted = this.queries.deleteTodo(id);
    if (!deleted) {
      throw new NotFoundError(`Todo with id ${id} not found`);
    }
  }
}
