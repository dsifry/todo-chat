// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express, { Request, Response } from "express";
import {
  createApp,
  addErrorHandler,
  sanitizeErrorMessage,
} from "./index.js";
import { validateBody } from "./middleware/validation.js";
import { CreateTodoInputSchema } from "../shared/validation.js";

describe("Express Server", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  describe("GET /api/health", () => {
    it("returns 200 with { status: 'ok' }", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("Global error handler", () => {
    it("returns ApiError format with sanitized message", async () => {
      // Add a throwing route BEFORE the error handler
      app.get("/test-error", (_req: Request, _res: Response) => {
        throw new Error(
          "Something failed at /usr/src/app/index.ts with key sk-ant-abc123",
        );
      });
      // Register the real error handler AFTER the route
      addErrorHandler(app);

      const res = await request(app).get("/test-error");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: expect.any(String),
        },
      });
      // Ensure internals are not exposed
      expect(res.body.error.message).not.toContain("/usr/src/app");
      expect(res.body.error.message).not.toContain("sk-ant-");
    });

    it("never exposes stack traces in error responses", async () => {
      app.get("/test-stack-error", (_req: Request, _res: Response) => {
        throw new Error(
          "Failure at Object.<anonymous> (/app/src/server/index.ts:42:5)",
        );
      });
      addErrorHandler(app);

      const res = await request(app).get("/test-stack-error");
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(res.body.error.message).not.toContain("/app/src/server");
      expect(res.body.error.message).not.toContain("Object.<anonymous>");
    });
  });

  describe("Body size limit", () => {
    it("rejects requests with body larger than 100kb", async () => {
      app.post("/test-body", (_req: Request, res: Response) => {
        res.json({ received: true });
      });
      addErrorHandler(app);

      // Create a payload larger than 100kb
      const largeBody = JSON.stringify({ data: "x".repeat(200_000) });

      const res = await request(app)
        .post("/test-body")
        .set("Content-Type", "application/json")
        .send(largeBody);

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    });
  });
});

describe("sanitizeErrorMessage", () => {
  it("removes file paths", () => {
    const result = sanitizeErrorMessage("Error at /usr/src/app/index.ts");
    expect(result).not.toContain("/usr/src/app");
    expect(result).toContain("[path]");
  });

  it("removes Anthropic API key patterns", () => {
    const result = sanitizeErrorMessage(
      "Auth failed with key sk-ant-api03-abc123-def456",
    );
    expect(result).not.toContain("sk-ant-");
    expect(result).toContain("[redacted]");
  });

  it("removes generic API key patterns", () => {
    const result = sanitizeErrorMessage("api_key=secret123abc");
    expect(result).not.toContain("secret123abc");
    expect(result).toContain("[redacted]");
  });

  it("removes stack trace fragments", () => {
    const result = sanitizeErrorMessage(
      "Failed at Object.<anonymous> (/app/src/index.ts:10:5)",
    );
    expect(result).not.toContain("Object.<anonymous>");
  });

  it("returns fallback message for empty strings", () => {
    const result = sanitizeErrorMessage("");
    expect(result).toBe("An unexpected error occurred");
  });
});

describe("validateBody middleware", () => {
  it("passes valid input through to next()", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test-validate",
      validateBody(CreateTodoInputSchema),
      (req: Request, res: Response) => {
        res.json({ title: req.body.title });
      },
    );

    const res = await request(app)
      .post("/test-validate")
      .send({ title: "Buy groceries" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: "Buy groceries" });
  });

  it("rejects invalid input with 400 and VALIDATION_ERROR", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test-validate",
      validateBody(CreateTodoInputSchema),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      },
    );

    const res = await request(app).post("/test-validate").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
      },
    });
  });

  it("rejects input that fails constraints", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test-validate",
      validateBody(CreateTodoInputSchema),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      },
    );

    // Title is too long (> 500 chars)
    const res = await request(app)
      .post("/test-validate")
      .send({ title: "x".repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("trims whitespace from string fields", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test-validate",
      validateBody(CreateTodoInputSchema),
      (req: Request, res: Response) => {
        res.json({ title: req.body.title });
      },
    );

    const res = await request(app)
      .post("/test-validate")
      .send({ title: "  Buy groceries  " });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Buy groceries");
  });

  it("rejects empty string titles after trimming", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test-validate",
      validateBody(CreateTodoInputSchema),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      },
    );

    const res = await request(app)
      .post("/test-validate")
      .send({ title: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
