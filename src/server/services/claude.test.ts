// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { Todo } from "../../shared/types.js";
import { ClaudeService, ToolCallResult, ToolExecutor } from "./claude.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Anthropic.Message response. */
function createMessage(
  content: Anthropic.ContentBlock[],
  stopReason: "end_turn" | "tool_use" = "end_turn",
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content,
    model: "claude-sonnet-4-5-20250929",
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as Anthropic.Message;
}

/** Create a text content block. */
function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null } as unknown as Anthropic.TextBlock;
}

/** Create a tool_use content block. */
function toolUseBlock(
  id: string,
  name: string,
  input: Record<string, unknown>,
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}

/** Build a minimal mock of the Anthropic SDK client. */
function createMockClient(
  ...responses: Anthropic.Message[]
): { client: Anthropic; createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn();
  let callIndex = 0;
  createSpy.mockImplementation(() => {
    const response = responses[callIndex++];
    if (!response) throw new Error("No more mock responses");
    return Promise.resolve(response);
  });

  const client = {
    messages: { create: createSpy },
  } as unknown as Anthropic;
  return { client, createSpy };
}

/** Helper to create a sample Todo. */
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    title: "Buy groceries",
    completed: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Consume the async generator fully, collecting yielded values and the return value. */
async function consumeStream(
  gen: AsyncGenerator<string | ToolCallResult, { fullText: string }>,
): Promise<{
  chunks: string[];
  toolResults: ToolCallResult[];
  result: { fullText: string };
}> {
  const chunks: string[] = [];
  const toolResults: ToolCallResult[] = [];
  let iterResult = await gen.next();
  while (!iterResult.done) {
    if (typeof iterResult.value === "string") {
      chunks.push(iterResult.value);
    } else {
      toolResults.push(iterResult.value);
    }
    iterResult = await gen.next();
  }
  return { chunks, toolResults, result: iterResult.value };
}

/** Create a simple tool executor mock. */
function createMockToolExecutor(): ToolExecutor & ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ result: { success: true } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClaudeService", () => {
  let service: ClaudeService;
  let createSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = createMockClient(
      createMessage([textBlock("Hello world!")]),
    );
    service = new ClaudeService(mock.client);
    createSpy = mock.createSpy;
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("accepts an Anthropic client and uses default model", () => {
      expect(service).toBeInstanceOf(ClaudeService);
    });

    it("accepts a custom model", async () => {
      const mock = createMockClient(
        createMessage([textBlock("hi")]),
      );
      const customService = new ClaudeService(mock.client, "claude-haiku-3");
      const gen = customService.streamChat(
        [{ role: "user", content: "hi" }],
        [],
      );
      await consumeStream(gen);
      expect(mock.createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-haiku-3" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // System prompt / todo context
  // -------------------------------------------------------------------------

  describe("system prompt", () => {
    it("includes current todo list with IDs in system prompt", async () => {
      const todos = [
        makeTodo({ id: 1, title: "Buy groceries", completed: true }),
        makeTodo({ id: 2, title: "Walk the dog", completed: false }),
      ];

      const gen = service.streamChat(
        [{ role: "user", content: "What should I do?" }],
        todos,
      );
      await consumeStream(gen);

      const systemPrompt = createSpy.mock.calls[0]![0].system as string;
      expect(systemPrompt).toContain("Current todo list:");
      expect(systemPrompt).toContain("[x] Buy groceries (id: 1)");
      expect(systemPrompt).toContain("[ ] Walk the dog (id: 2)");
    });

    it("shows empty message when no todos exist", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const systemPrompt = createSpy.mock.calls[0]![0].system as string;
      expect(systemPrompt).toContain("(empty - no todos yet)");
    });

    it("instructs Claude to use tools for todo management", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const systemPrompt = createSpy.mock.calls[0]![0].system as string;
      expect(systemPrompt).toContain("Use the tools");
    });
  });

  // -------------------------------------------------------------------------
  // Streaming — simple text response
  // -------------------------------------------------------------------------

  describe("streaming", () => {
    it("yields text blocks as chunks", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      const { chunks } = await consumeStream(gen);

      expect(chunks).toEqual(["Hello world!"]);
    });

    it("returns full text when stream completes", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.fullText).toBe("Hello world!");
    });

    it("passes messages to the SDK", async () => {
      const messages = [
        { role: "user" as const, content: "First message" },
        { role: "assistant" as const, content: "Response" },
        { role: "user" as const, content: "Second message" },
      ];

      const gen = service.streamChat(messages, []);
      await consumeStream(gen);

      const callArgs = createSpy.mock.calls[0]![0];
      expect(callArgs.messages).toEqual(messages);
    });

    it("sets max_tokens in the request", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const callArgs = createSpy.mock.calls[0]![0];
      expect(callArgs.max_tokens).toBe(1024);
    });

    it("includes tool definitions in the request", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const callArgs = createSpy.mock.calls[0]![0];
      expect(callArgs.tools).toBeDefined();
      const toolNames = callArgs.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("get_todos");
      expect(toolNames).toContain("add_todos");
      expect(toolNames).toContain("update_todos");
      expect(toolNames).toContain("delete_todos");
      expect(toolNames).toContain("search_todos");
    });

    it("handles multiple text blocks in one response", async () => {
      const mock = createMockClient(
        createMessage([textBlock("Hello "), textBlock("world!")]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      const { chunks, result } = await consumeStream(gen);

      expect(chunks).toEqual(["Hello ", "world!"]);
      expect(result.fullText).toBe("Hello world!");
    });
  });

  // -------------------------------------------------------------------------
  // Tool use
  // -------------------------------------------------------------------------

  describe("tool use", () => {
    it("executes tools and yields ToolCallResult", async () => {
      const toolExecutor = createMockToolExecutor();

      const mock = createMockClient(
        // First response: tool_use
        createMessage(
          [
            toolUseBlock("call_1", "add_todos", {
              todos: [{ title: "Buy milk" }],
            }),
          ],
          "tool_use",
        ),
        // Second response: text after tool result
        createMessage([textBlock("I added 'Buy milk' to your list.")]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add buy milk" }],
        [],
        toolExecutor,
      );
      const { chunks, toolResults, result } = await consumeStream(gen);

      expect(toolResults).toHaveLength(1);
      expect(toolResults[0]!.toolName).toBe("add_todos");
      expect(toolResults[0]!.toolUseId).toBe("call_1");
      expect(toolResults[0]!.result).toEqual({ success: true });
      expect(chunks).toEqual(["I added 'Buy milk' to your list."]);
      expect(result.fullText).toBe("I added 'Buy milk' to your list.");
    });

    it("handles multiple tool calls in one response", async () => {
      const toolExecutor = createMockToolExecutor();

      const mock = createMockClient(
        createMessage(
          [
            toolUseBlock("call_1", "add_todos", {
              todos: [{ title: "Task 1" }],
            }),
            toolUseBlock("call_2", "add_todos", {
              todos: [{ title: "Task 2" }],
            }),
          ],
          "tool_use",
        ),
        createMessage([textBlock("Added both tasks.")]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add two tasks" }],
        [],
        toolExecutor,
      );
      const { toolResults } = await consumeStream(gen);

      expect(toolResults).toHaveLength(2);
      expect(toolExecutor).toHaveBeenCalledTimes(2);
    });

    it("handles tool error results", async () => {
      const toolExecutor = vi
        .fn()
        .mockResolvedValue({ result: null, error: "Todo not found" });

      const mock = createMockClient(
        createMessage(
          [
            toolUseBlock("call_1", "delete_todos", { todo_ids: [999] }),
          ],
          "tool_use",
        ),
        createMessage([textBlock("I couldn't find that todo.")]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Delete todo 999" }],
        [],
        toolExecutor,
      );
      const { toolResults } = await consumeStream(gen);

      expect(toolResults[0]!.error).toBe("Todo not found");

      // Verify tool_result was sent with is_error: true
      const secondCallMessages = mock.createSpy.mock.calls[1]![0].messages;
      const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
      expect(toolResultMessage.content[0].is_error).toBe(true);
    });

    it("sends tool results back to Claude for continuation", async () => {
      const toolExecutor = vi
        .fn()
        .mockResolvedValue({ result: [{ id: 1, title: "Buy milk", completed: false }] });

      const mock = createMockClient(
        createMessage(
          [
            toolUseBlock("call_1", "get_todos", { status: "all" }),
          ],
          "tool_use",
        ),
        createMessage([textBlock("You have 1 todo.")]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "How many todos?" }],
        [],
        toolExecutor,
      );
      await consumeStream(gen);

      // The second API call should include the tool results
      expect(mock.createSpy).toHaveBeenCalledTimes(2);
      const secondCallMessages = mock.createSpy.mock.calls[1]![0].messages;
      // Should have: original user msg, assistant (tool_use), user (tool_result)
      expect(secondCallMessages.length).toBeGreaterThanOrEqual(3);
    });

    it("does not execute tools when no toolExecutor provided", async () => {
      const mock = createMockClient(
        createMessage(
          [
            textBlock("I would add that for you, but "),
            toolUseBlock("call_1", "add_todos", {
              todos: [{ title: "Test" }],
            }),
          ],
          "tool_use",
        ),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add a todo" }],
        [],
        // No toolExecutor
      );
      const { chunks, toolResults } = await consumeStream(gen);

      expect(chunks).toEqual(["I would add that for you, but "]);
      expect(toolResults).toHaveLength(0);
      // Should only make one API call (no continuation)
      expect(mock.createSpy).toHaveBeenCalledTimes(1);
    });

    it("handles text + tool_use in the same response", async () => {
      const toolExecutor = createMockToolExecutor();

      const mock = createMockClient(
        createMessage(
          [
            textBlock("Let me add that. "),
            toolUseBlock("call_1", "add_todos", {
              todos: [{ title: "Exercise" }],
            }),
          ],
          "tool_use",
        ),
        createMessage([textBlock("Done!")]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add exercise" }],
        [],
        toolExecutor,
      );
      const { chunks, toolResults, result } = await consumeStream(gen);

      expect(chunks).toEqual(["Let me add that. ", "Done!"]);
      expect(toolResults).toHaveLength(1);
      expect(result.fullText).toBe("Let me add that. Done!");
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("handles API errors gracefully", async () => {
      const createSpy = vi.fn().mockRejectedValue(
        new Error("rate_limit_error: Too many requests"),
      );
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow(/rate.limit/i);
    });

    it("handles authentication errors gracefully", async () => {
      const createSpy = vi.fn().mockRejectedValue(
        new Error("authentication_error: Invalid API key"),
      );
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow(/authentication/i);
    });

    it("handles network errors gracefully", async () => {
      const createSpy = vi.fn().mockRejectedValue(
        new Error("Connection refused"),
      );
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow();
    });

    it("never exposes ANTHROPIC_API_KEY pattern in error messages", async () => {
      const createSpy = vi.fn().mockRejectedValue(
        new Error(
          "Error: Invalid API key sk-ant-api03-abc123xyz provided at /home/app/node_modules/@anthropic-ai/sdk/index.js:42",
        ),
      );
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      try {
        await consumeStream(gen);
        expect(true).toBe(false);
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).not.toMatch(/sk-ant-/);
        expect(message).not.toContain("sk-ant-api03-abc123xyz");
      }
    });

    it("sanitizes file paths from error messages", async () => {
      const createSpy = vi.fn().mockRejectedValue(
        new Error(
          "ENOENT: no such file or directory at /home/user/.config/anthropic/key",
        ),
      );
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      try {
        await consumeStream(gen);
        expect(true).toBe(false);
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).not.toContain("/home/user/.config/anthropic/key");
      }
    });

    it("sanitizes api_key patterns from error messages", async () => {
      const createSpy = vi.fn().mockRejectedValue(
        new Error("api_key: sk-ant-secret-value was rejected"),
      );
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      try {
        await consumeStream(gen);
        expect(true).toBe(false);
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).not.toMatch(/sk-ant-/);
      }
    });

    it("handles non-Error thrown values from API", async () => {
      const createSpy = vi.fn().mockRejectedValue("string error");
      const client = { messages: { create: createSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow(
        "An unexpected error occurred",
      );
    });
  });

  // -------------------------------------------------------------------------
  // API key handling
  // -------------------------------------------------------------------------

  describe("API key handling", () => {
    it("relies on the injected client for API key management", () => {
      const mock = createMockClient(createMessage([textBlock("test")]));
      const svc = new ClaudeService(mock.client);
      expect(svc).toBeInstanceOf(ClaudeService);
    });
  });
});
