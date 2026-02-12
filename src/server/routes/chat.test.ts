// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { ChatMessage, Todo, TodoSuggestion } from "../../shared/types.js";
import type { Queries } from "../db/queries.js";
import type { ClaudeService, StreamChatResult } from "../services/claude.js";
import { ChatService, ValidationError } from "../services/chat.js";
import { createChatRouter } from "./chat.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Queries object with sensible defaults. */
function createMockQueries(): Queries {
  return {
    getChatHistory: vi.fn().mockReturnValue([]),
    createChatMessage: vi.fn().mockImplementation(
      (role: "user" | "assistant", content: string): ChatMessage => ({
        id: Math.floor(Math.random() * 1000) + 1,
        role,
        content,
        createdAt: new Date().toISOString(),
      }),
    ),
    getAllTodos: vi.fn().mockReturnValue([]),
    createTodoSuggestion: vi.fn().mockImplementation(
      (chatMessageId: number, title: string): TodoSuggestion => ({
        id: Math.floor(Math.random() * 1000) + 1,
        chatMessageId,
        title,
        accepted: false,
      }),
    ),
    // These are on Queries but not used by ChatService directly
    getTodoById: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    acceptTodoSuggestion: vi.fn(),
  } as unknown as Queries;
}

/** Create a mock ClaudeService. */
function createMockClaudeService(): ClaudeService {
  return {
    streamChat: vi.fn(),
  } as unknown as ClaudeService;
}

/**
 * Create a mock async generator that yields chunks and returns a StreamChatResult.
 */
function createMockStreamGenerator(
  chunks: string[],
  result: StreamChatResult,
): AsyncGenerator<string, StreamChatResult> {
  async function* gen(): AsyncGenerator<string, StreamChatResult> {
    for (const chunk of chunks) {
      yield chunk;
    }
    return result;
  }
  return gen();
}

/**
 * Create a mock async generator that yields some chunks then throws an error.
 */
function createFailingStreamGenerator(
  error: Error,
): AsyncGenerator<string, StreamChatResult> {
  async function* gen(): AsyncGenerator<string, StreamChatResult> {
    throw error;
  }
  return gen();
}

/** Consume a ChatService sendMessage generator fully. */
async function consumeSendMessage(
  gen: AsyncGenerator<
    string,
    { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] }
  >,
): Promise<{
  chunks: string[];
  result: { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] };
}> {
  const chunks: string[] = [];
  let iterResult = await gen.next();
  while (!iterResult.done) {
    chunks.push(iterResult.value);
    iterResult = await gen.next();
  }
  return { chunks, result: iterResult.value };
}

/** Parse SSE events from a raw response body string. */
function parseSSEEvents(
  body: string,
): Array<{ type: string; [key: string]: unknown }> {
  return body
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.replace("data: ", "")) as { type: string; [key: string]: unknown });
}

/** Shape of the mock ChatService used in route tests. */
interface MockChatService {
  getHistory: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
}

/** Create a mock ChatService for route tests. */
function createMockChatService(): MockChatService {
  return {
    getHistory: vi.fn().mockReturnValue([]),
    sendMessage: vi.fn(),
  };
}

// ===========================================================================
// ChatService Tests
// ===========================================================================

describe("ChatService", () => {
  let service: ChatService;
  let mockQueries: Queries;
  let mockClaudeService: ClaudeService;

  beforeEach(() => {
    mockQueries = createMockQueries();
    mockClaudeService = createMockClaudeService();
    service = new ChatService(mockQueries, mockClaudeService);
  });

  // -------------------------------------------------------------------------
  // getHistory
  // -------------------------------------------------------------------------

  describe("getHistory", () => {
    it("delegates to queries.getChatHistory", () => {
      const history: ChatMessage[] = [
        { id: 1, role: "user", content: "Hello", createdAt: "2024-01-01" },
        {
          id: 2,
          role: "assistant",
          content: "Hi there!",
          createdAt: "2024-01-01",
        },
      ];
      vi.mocked(mockQueries.getChatHistory).mockReturnValue(history);

      const result = service.getHistory();

      expect(mockQueries.getChatHistory).toHaveBeenCalledOnce();
      expect(result).toEqual(history);
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage — validation
  // -------------------------------------------------------------------------

  describe("sendMessage — validation", () => {
    it("throws ValidationError for empty string", async () => {
      const gen = service.sendMessage("");

      await expect(consumeSendMessage(gen)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for whitespace-only string", async () => {
      const gen = service.sendMessage("   ");

      await expect(consumeSendMessage(gen)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for content exceeding 4000 characters", async () => {
      const gen = service.sendMessage("x".repeat(4001));

      await expect(consumeSendMessage(gen)).rejects.toThrow(ValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage — orchestration
  // -------------------------------------------------------------------------

  describe("sendMessage — orchestration", () => {
    it("persists user message before streaming", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMessage);
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createMockStreamGenerator(["Hi!"], {
          fullText: "Hi!",
          suggestions: [],
        }),
      );

      const gen = service.sendMessage("Hello");
      await consumeSendMessage(gen);

      expect(mockQueries.createChatMessage).toHaveBeenCalledWith(
        "user",
        "Hello",
      );
    });

    it("yields chunks from ClaudeService", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMessage);
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createMockStreamGenerator(["Hello ", "world!"], {
          fullText: "Hello world!",
          suggestions: [],
        }),
      );

      const gen = service.sendMessage("Hello");
      const { chunks } = await consumeSendMessage(gen);

      expect(chunks).toEqual(["Hello ", "world!"]);
    });

    it("passes chat history and todos to ClaudeService", async () => {
      const todos: Todo[] = [
        {
          id: 1,
          title: "Buy milk",
          completed: false,
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      ];
      // After the user message is persisted, getChatHistory returns full history
      const fullHistory: ChatMessage[] = [
        { id: 1, role: "user", content: "Previous msg", createdAt: "2024-01-01" },
        { id: 2, role: "user", content: "Hello", createdAt: "2024-01-01" },
      ];
      vi.mocked(mockQueries.getChatHistory).mockReturnValue(fullHistory);
      vi.mocked(mockQueries.getAllTodos).mockReturnValue(todos);

      const userMessage: ChatMessage = {
        id: 2,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMessage);
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createMockStreamGenerator(["Response"], {
          fullText: "Response",
          suggestions: [],
        }),
      );

      const gen = service.sendMessage("Hello");
      await consumeSendMessage(gen);

      expect(mockClaudeService.streamChat).toHaveBeenCalledWith(
        [
          { role: "user", content: "Previous msg" },
          { role: "user", content: "Hello" },
        ],
        todos,
      );
    });

    it("persists assistant message after stream completes", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Hi there!",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage)
        .mockReturnValueOnce(userMessage)
        .mockReturnValueOnce(assistantMessage);
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createMockStreamGenerator(["Hi ", "there!"], {
          fullText: "Hi there!",
          suggestions: [],
        }),
      );

      const gen = service.sendMessage("Hello");
      const { result } = await consumeSendMessage(gen);

      expect(mockQueries.createChatMessage).toHaveBeenCalledWith(
        "assistant",
        "Hi there!",
      );
      expect(result.assistantMessage).toEqual(assistantMessage);
    });

    it("persists suggestions with reference to assistant message", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Here are tasks",
        createdAt: "2024-01-01",
      };
      const suggestion1: TodoSuggestion = {
        id: 10,
        chatMessageId: 2,
        title: "Task one",
        accepted: false,
      };
      const suggestion2: TodoSuggestion = {
        id: 11,
        chatMessageId: 2,
        title: "Task two",
        accepted: false,
      };

      vi.mocked(mockQueries.createChatMessage)
        .mockReturnValueOnce(userMessage)
        .mockReturnValueOnce(assistantMessage);
      vi.mocked(mockQueries.createTodoSuggestion)
        .mockReturnValueOnce(suggestion1)
        .mockReturnValueOnce(suggestion2);
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createMockStreamGenerator(["Here are tasks"], {
          fullText: "Here are tasks",
          suggestions: ["Task one", "Task two"],
        }),
      );

      const gen = service.sendMessage("Hello");
      const { result } = await consumeSendMessage(gen);

      expect(mockQueries.createTodoSuggestion).toHaveBeenCalledWith(
        2,
        "Task one",
      );
      expect(mockQueries.createTodoSuggestion).toHaveBeenCalledWith(
        2,
        "Task two",
      );
      expect(result.suggestions).toEqual([suggestion1, suggestion2]);
    });

    it("handles ClaudeService errors with sanitized message", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMessage);
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createFailingStreamGenerator(
          new Error("API key sk-ant-secret-123 was invalid at /home/app/sdk.js"),
        ),
      );

      const gen = service.sendMessage("Hello");

      await expect(consumeSendMessage(gen)).rejects.toThrow(
        expect.not.stringContaining("sk-ant-"),
      );
    });

    it("handles non-Error thrown values from ClaudeService", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMessage);

      async function* failGen(): AsyncGenerator<string, StreamChatResult> {
        throw "string error";
      }
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(failGen());

      const gen = service.sendMessage("Hello");

      await expect(consumeSendMessage(gen)).rejects.toThrow(
        "An unexpected error occurred",
      );
    });
  });
});

// ===========================================================================
// Chat Routes Tests
// ===========================================================================

describe("Chat Routes", () => {
  let app: express.Express;
  let mockService: ReturnType<typeof createMockChatService>;

  beforeEach(() => {
    mockService = createMockChatService();

    app = express();
    app.use(express.json());
    app.use("/api/chat", createChatRouter(mockService as unknown as ChatService));
  });

  // -------------------------------------------------------------------------
  // GET /api/chat
  // -------------------------------------------------------------------------

  describe("GET /api/chat", () => {
    it("returns 200 with empty array when no messages exist", async () => {
      mockService.getHistory.mockReturnValue([]);

      const res = await request(app).get("/api/chat");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 200 with chat message history", async () => {
      const messages: ChatMessage[] = [
        { id: 1, role: "user", content: "Hello", createdAt: "2024-01-01" },
        {
          id: 2,
          role: "assistant",
          content: "Hi there!",
          createdAt: "2024-01-01",
        },
      ];
      mockService.getHistory.mockReturnValue(messages);

      const res = await request(app).get("/api/chat");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/chat/message — SSE streaming
  // -------------------------------------------------------------------------

  describe("POST /api/chat/message", () => {
    it("returns SSE format with chunks and done event", async () => {
      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Hello world!",
        createdAt: "2024-01-01",
      };

      async function* mockGen(): AsyncGenerator<
        string,
        { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] }
      > {
        yield "Hello ";
        yield "world!";
        return { assistantMessage, suggestions: [] };
      }
      mockService.sendMessage.mockReturnValue(mockGen());

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Hello" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");
      expect(res.headers["cache-control"]).toBe("no-cache");

      const events = parseSSEEvents(res.body as string);

      // Should have chunk events followed by done
      expect(events[0]).toEqual({ type: "chunk", content: "Hello " });
      expect(events[1]).toEqual({ type: "chunk", content: "world!" });
      expect(events[events.length - 1]).toEqual({ type: "done" });
    });

    it("includes suggestions event when suggestions are present", async () => {
      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Here are tasks",
        createdAt: "2024-01-01",
      };
      const suggestions: TodoSuggestion[] = [
        { id: 10, chatMessageId: 2, title: "Task one", accepted: false },
        { id: 11, chatMessageId: 2, title: "Task two", accepted: false },
      ];

      async function* mockGen(): AsyncGenerator<
        string,
        { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] }
      > {
        yield "Here are tasks";
        return { assistantMessage, suggestions };
      }
      mockService.sendMessage.mockReturnValue(mockGen());

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Hello" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      // chunk, suggestions, done
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "chunk", content: "Here are tasks" });
      expect(events[1]).toEqual({
        type: "suggestions",
        items: suggestions,
      });
      expect(events[2]).toEqual({ type: "done" });
    });

    it("does not include suggestions event when suggestions array is empty", async () => {
      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Hello",
        createdAt: "2024-01-01",
      };

      async function* mockGen(): AsyncGenerator<
        string,
        { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] }
      > {
        yield "Hello";
        return { assistantMessage, suggestions: [] };
      }
      mockService.sendMessage.mockReturnValue(mockGen());

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Hello" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      // chunk, done — no suggestions event
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "chunk", content: "Hello" });
      expect(events[1]).toEqual({ type: "done" });
    });

    it("returns SSE error event for empty content (ValidationError)", async () => {
      mockService.sendMessage.mockImplementation(() => {
        throw new ValidationError("Content is required");
      });

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("error");
      expect(events[0]!.message).toBeDefined();
    });

    it("returns SSE error event for too-long content (ValidationError)", async () => {
      mockService.sendMessage.mockImplementation(() => {
        throw new ValidationError("Content too long");
      });

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "x".repeat(4001) })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("error");
      expect(events[0]!.message).toBeDefined();
    });

    it("returns SSE error event when Claude fails mid-stream", async () => {
      async function* mockGen(): AsyncGenerator<
        string,
        { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] }
      > {
        yield "partial";
        throw new Error("Claude API failure at /internal/path");
      }
      mockService.sendMessage.mockReturnValue(mockGen());

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Hello" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      // Should have the partial chunk, then an error event
      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.message).toBeDefined();
      // Error message should be sanitized — no internal paths
      expect(errorEvent!.message).not.toContain("/internal/path");
    });

    it("returns SSE error event for generic errors with sanitized message", async () => {
      mockService.sendMessage.mockImplementation(() => {
        throw new Error("DB error at /var/db/chat.sqlite");
      });

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Hello" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("error");
      expect(events[0]!.message).not.toContain("/var/db/chat.sqlite");
    });

    it("returns SSE error event for non-Error thrown values", async () => {
      mockService.sendMessage.mockImplementation(() => {
        throw "string error";
      });

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Hello" })
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            callback(null, data);
          });
        });

      const events = parseSSEEvents(res.body as string);

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("error");
      expect(events[0]!.message).toBe("An unexpected error occurred");
    });
  });
});
