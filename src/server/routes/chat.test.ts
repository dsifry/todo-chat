// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { ChatMessage, Todo } from "../../shared/types.js";
import type { Queries } from "../db/queries.js";
import type { ClaudeService, StreamChatResult, ToolCallResult } from "../services/claude.js";
import type { TodoService } from "../services/todo.js";
import { ChatService, ChatStreamEvent, ValidationError } from "../services/chat.js";
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
    createTodoSuggestion: vi.fn(),
    clearChatHistory: vi.fn(),
    searchTodos: vi.fn().mockReturnValue([]),
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

/** Create a mock TodoService. */
function createMockTodoService(): TodoService {
  return {
    getAll: vi.fn().mockReturnValue([]),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    search: vi.fn().mockReturnValue([]),
  } as unknown as TodoService;
}

/**
 * Create a mock async generator for ClaudeService.streamChat
 * that yields strings and ToolCallResults, then returns StreamChatResult.
 */
function createMockStreamGenerator(
  chunks: Array<string | ToolCallResult>,
  result: StreamChatResult,
): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
  async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
    for (const chunk of chunks) {
      yield chunk;
    }
    return result;
  }
  return gen();
}

/**
 * Create a mock async generator that throws an error.
 */
function createFailingStreamGenerator(
  error: Error,
): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
  async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
    throw error;
  }
  return gen();
}

/** Consume a ChatService sendMessage generator fully. */
async function consumeSendMessage(
  gen: AsyncGenerator<
    ChatStreamEvent,
    { assistantMessage: ChatMessage }
  >,
): Promise<{
  events: ChatStreamEvent[];
  result: { assistantMessage: ChatMessage };
}> {
  const events: ChatStreamEvent[] = [];
  let iterResult = await gen.next();
  while (!iterResult.done) {
    events.push(iterResult.value);
    iterResult = await gen.next();
  }
  return { events, result: iterResult.value };
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
  clearHistory: ReturnType<typeof vi.fn>;
}

/** Create a mock ChatService for route tests. */
function createMockChatService(): MockChatService {
  return {
    getHistory: vi.fn().mockReturnValue([]),
    sendMessage: vi.fn(),
    clearHistory: vi.fn(),
  };
}

// ===========================================================================
// ChatService Tests
// ===========================================================================

describe("ChatService", () => {
  let service: ChatService;
  let mockQueries: Queries;
  let mockClaudeService: ClaudeService;
  let mockTodoService: TodoService;

  beforeEach(() => {
    mockQueries = createMockQueries();
    mockClaudeService = createMockClaudeService();
    mockTodoService = createMockTodoService();
    service = new ChatService(mockQueries, mockClaudeService, mockTodoService);
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
  // clearHistory
  // -------------------------------------------------------------------------

  describe("clearHistory", () => {
    it("delegates to queries.clearChatHistory", () => {
      service.clearHistory();
      expect(mockQueries.clearChatHistory).toHaveBeenCalledOnce();
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
        }),
      );

      const gen = service.sendMessage("Hello");
      await consumeSendMessage(gen);

      expect(mockQueries.createChatMessage).toHaveBeenCalledWith(
        "user",
        "Hello",
      );
    });

    it("yields chunk events from ClaudeService text", async () => {
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
        }),
      );

      const gen = service.sendMessage("Hello");
      const { events } = await consumeSendMessage(gen);

      expect(events).toEqual([
        { type: "chunk", content: "Hello " },
        { type: "chunk", content: "world!" },
      ]);
    });

    it("yields tool_result events from ClaudeService tool calls", async () => {
      const userMessage: ChatMessage = {
        id: 1,
        role: "user",
        content: "Add a todo",
        createdAt: "2024-01-01",
      };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMessage);

      const toolCallResult: ToolCallResult = {
        toolName: "add_todos",
        toolUseId: "call_1",
        result: [{ id: 1, title: "New todo" }],
      };

      vi.mocked(mockClaudeService.streamChat).mockReturnValue(
        createMockStreamGenerator([toolCallResult, "Done!"], {
          fullText: "Done!",
        }),
      );

      const gen = service.sendMessage("Add a todo");
      const { events } = await consumeSendMessage(gen);

      expect(events).toEqual([
        {
          type: "tool_result",
          toolName: "add_todos",
          result: [{ id: 1, title: "New todo" }],
        },
        { type: "chunk", content: "Done!" },
      ]);
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
        expect.any(Function),
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

      async function* failGen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
        throw "string error";
      }
      vi.mocked(mockClaudeService.streamChat).mockReturnValue(failGen());

      const gen = service.sendMessage("Hello");

      await expect(consumeSendMessage(gen)).rejects.toThrow(
        "An unexpected error occurred",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tool executor
  // -------------------------------------------------------------------------

  describe("tool executor", () => {
    it("get_todos returns all todos", async () => {
      const todos: Todo[] = [
        { id: 1, title: "Task 1", completed: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ];
      vi.mocked(mockTodoService.getAll).mockReturnValue(todos);

      // Access the tool executor via the streamChat call
      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("get_todos", { status: "all" });
              yield { toolName: "get_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "List", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("List");
      const { events } = await consumeSendMessage(gen);

      expect(events[0]).toEqual({
        type: "tool_result",
        toolName: "get_todos",
        result: todos,
      });
    });

    it("get_todos filters by completed status", async () => {
      const todos: Todo[] = [
        { id: 1, title: "Done", completed: true, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        { id: 2, title: "Pending", completed: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ];
      vi.mocked(mockTodoService.getAll).mockReturnValue(todos);

      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("get_todos", { status: "completed" });
              yield { toolName: "get_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Done?", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Done?");
      const { events } = await consumeSendMessage(gen);

      const toolEvent = events[0] as { type: "tool_result"; result: Todo[] };
      expect(toolEvent.result).toHaveLength(1);
      expect(toolEvent.result[0]!.title).toBe("Done");
    });

    it("get_todos filters by pending status", async () => {
      const todos: Todo[] = [
        { id: 1, title: "Done", completed: true, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        { id: 2, title: "Pending", completed: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ];
      vi.mocked(mockTodoService.getAll).mockReturnValue(todos);

      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("get_todos", { status: "pending" });
              yield { toolName: "get_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Pending?", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Pending?");
      const { events } = await consumeSendMessage(gen);

      const toolEvent = events[0] as { type: "tool_result"; result: Todo[] };
      expect(toolEvent.result).toHaveLength(1);
      expect(toolEvent.result[0]!.title).toBe("Pending");
    });

    it("add_todos creates todos via TodoService", async () => {
      const created: Todo = { id: 5, title: "New task", completed: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
      vi.mocked(mockTodoService.create).mockReturnValue(created);

      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("add_todos", { todos: [{ title: "New task" }] });
              yield { toolName: "add_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Add", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Add");
      await consumeSendMessage(gen);

      expect(mockTodoService.create).toHaveBeenCalledWith("New task");
    });

    it("update_todos updates todos via TodoService", async () => {
      const updated: Todo = { id: 1, title: "Updated", completed: true, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
      vi.mocked(mockTodoService.update).mockReturnValue(updated);

      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("update_todos", { todos: [{ id: 1, completed: true }] });
              yield { toolName: "update_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Done", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Done");
      await consumeSendMessage(gen);

      expect(mockTodoService.update).toHaveBeenCalledWith(1, { completed: true, title: undefined });
    });

    it("delete_todos deletes todos via TodoService", async () => {
      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("delete_todos", { todo_ids: [1, 2] });
              yield { toolName: "delete_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Delete", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Delete");
      await consumeSendMessage(gen);

      expect(mockTodoService.delete).toHaveBeenCalledWith(1);
      expect(mockTodoService.delete).toHaveBeenCalledWith(2);
    });

    it("search_todos searches via TodoService", async () => {
      const results: Todo[] = [
        { id: 1, title: "Buy milk", completed: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ];
      vi.mocked(mockTodoService.search).mockReturnValue(results);

      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("search_todos", { query: "milk" });
              yield { toolName: "search_todos", toolUseId: "call_1", result: result.result } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Find milk", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Find milk");
      await consumeSendMessage(gen);

      expect(mockTodoService.search).toHaveBeenCalledWith("milk");
    });

    it("handles unknown tool names", async () => {
      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("unknown_tool", {});
              yield { toolName: "unknown_tool", toolUseId: "call_1", result: result.result, error: result.error } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Unknown", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Unknown");
      const { events } = await consumeSendMessage(gen);

      const toolEvent = events[0] as { type: "tool_result"; result: unknown; toolName: string };
      // Should have yielded a tool_result event - the error is in the ToolCallResult
      expect(toolEvent.type).toBe("tool_result");
    });

    it("handles tool execution errors gracefully", async () => {
      vi.mocked(mockTodoService.delete).mockImplementation(() => {
        throw new Error("Todo with id 999 not found");
      });

      vi.mocked(mockClaudeService.streamChat).mockImplementation(
        (_messages, _todos, toolExecutor) => {
          async function* gen(): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
            if (toolExecutor) {
              const result = await toolExecutor("delete_todos", { todo_ids: [999] });
              yield { toolName: "delete_todos", toolUseId: "call_1", result: result.result, error: result.error } as ToolCallResult;
            }
            return { fullText: "" };
          }
          return gen();
        },
      );

      const userMsg: ChatMessage = { id: 1, role: "user", content: "Delete 999", createdAt: "2024-01-01" };
      vi.mocked(mockQueries.createChatMessage).mockReturnValueOnce(userMsg);

      const gen = service.sendMessage("Delete 999");
      const { events } = await consumeSendMessage(gen);

      // Should not throw, but yield with error
      expect(events).toHaveLength(1);
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
  // DELETE /api/chat
  // -------------------------------------------------------------------------

  describe("DELETE /api/chat", () => {
    it("returns 204 and calls clearHistory", async () => {
      const res = await request(app).delete("/api/chat");

      expect(res.status).toBe(204);
      expect(mockService.clearHistory).toHaveBeenCalledOnce();
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
        ChatStreamEvent,
        { assistantMessage: ChatMessage }
      > {
        yield { type: "chunk", content: "Hello " };
        yield { type: "chunk", content: "world!" };
        return { assistantMessage };
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

      expect(events[0]).toEqual({ type: "chunk", content: "Hello " });
      expect(events[1]).toEqual({ type: "chunk", content: "world!" });
      expect(events[events.length - 1]).toEqual({ type: "done" });
    });

    it("includes todo_operation event when tool_result is yielded", async () => {
      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Added!",
        createdAt: "2024-01-01",
      };

      async function* mockGen(): AsyncGenerator<
        ChatStreamEvent,
        { assistantMessage: ChatMessage }
      > {
        yield {
          type: "tool_result",
          toolName: "add_todos",
          result: [{ id: 1, title: "New task", completed: false }],
        };
        yield { type: "chunk", content: "Added!" };
        return { assistantMessage };
      }
      mockService.sendMessage.mockReturnValue(mockGen());

      const res = await request(app)
        .post("/api/chat/message")
        .send({ content: "Add a task" })
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

      // todo_operation, chunk, done
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        type: "todo_operation",
        toolName: "add_todos",
        result: [{ id: 1, title: "New task", completed: false }],
      });
      expect(events[1]).toEqual({ type: "chunk", content: "Added!" });
      expect(events[2]).toEqual({ type: "done" });
    });

    it("calls broadcast for todo_operation events when broadcast is provided", async () => {
      const broadcast = vi.fn();
      const appWithBroadcast = express();
      appWithBroadcast.use(express.json());
      appWithBroadcast.use(
        "/api/chat",
        createChatRouter(mockService as unknown as ChatService, broadcast),
      );

      const assistantMessage: ChatMessage = {
        id: 2,
        role: "assistant",
        content: "Added!",
        createdAt: "2024-01-01",
      };

      const createdTodo = { id: 1, title: "New task", completed: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" };

      async function* mockGen(): AsyncGenerator<
        ChatStreamEvent,
        { assistantMessage: ChatMessage }
      > {
        yield {
          type: "tool_result",
          toolName: "add_todos",
          result: [createdTodo],
        };
        return { assistantMessage };
      }
      mockService.sendMessage.mockReturnValue(mockGen());

      await request(appWithBroadcast)
        .post("/api/chat/message")
        .send({ content: "Add" })
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

      expect(broadcast).toHaveBeenCalled();
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
        ChatStreamEvent,
        { assistantMessage: ChatMessage }
      > {
        yield { type: "chunk", content: "partial" };
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

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.message).toBeDefined();
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
