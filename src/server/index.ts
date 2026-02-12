import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./db/schema.js";
import { createQueries } from "./db/queries.js";
import { TodoService } from "./services/todo.js";
import { createTodoRouter } from "./routes/todos.js";
import { createWebSocketServer } from "./websocket/handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_PORT = 3001;

export function createApp(db?: Database.Database): express.Express {
  const app = express();

  // Body parsing with size limit
  app.use(express.json({ limit: "100kb" }));

  // Rate limiting for chat endpoints
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      },
    },
  });
  app.use("/api/chat", chatLimiter);

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Mount todo routes when a database is provided
  if (db) {
    const queries = createQueries(db);
    const todoService = new TodoService(queries);
    app.use("/api/todos", createTodoRouter(todoService));
  }

  // Static file serving for production
  const distPath = path.resolve(__dirname, "../../dist");
  app.use(express.static(distPath));

  return app;
}

export function addErrorHandler(app: express.Express): void {
  app.use(
    (
      err: Error & { status?: number; statusCode?: number },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const statusCode = err.status ?? err.statusCode ?? 500;
      const sanitizedMessage = sanitizeErrorMessage(err.message);
      const code =
        statusCode === 413
          ? "PAYLOAD_TOO_LARGE"
          : statusCode === 400
            ? "BAD_REQUEST"
            : "INTERNAL_ERROR";
      res.status(statusCode).json({
        error: {
          code,
          message: sanitizedMessage,
        },
      });
    },
  );
}

export function createFullApp(db?: Database.Database): express.Express {
  const app = createApp(db);
  addErrorHandler(app);
  return app;
}

export function sanitizeErrorMessage(message: string): string {
  // Remove file paths
  let sanitized = message.replace(/\/[\w./\\-]+/g, "[path]");
  // Remove stack traces
  sanitized = sanitized.replace(/at\s+[\w.<>]+\s+\(.*\)/g, "");
  // Remove Anthropic API key patterns
  sanitized = sanitized.replace(/sk-ant-[\w-]+/g, "[redacted]");
  // Generic fallback for any remaining sensitive patterns
  sanitized = sanitized.replace(/api[_-]?key[s]?\s*[:=]\s*\S+/gi, "[redacted]");
  return sanitized.trim() || "An unexpected error occurred";
}

export function startServer(
  port: number = Number(process.env.PORT) || SERVER_PORT,
  host: string = process.env.HOST || "127.0.0.1",
): void {
  const db = initializeDatabase("todo-chat.db");
  const app = createFullApp(db);

  const server = app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });

  const queries = createQueries(db);
  const todoService = new TodoService(queries);
  createWebSocketServer(server, todoService);
}

// Auto-start when run directly (not when imported by tests)
if (process.env.NODE_ENV !== "test") {
  startServer();
}
