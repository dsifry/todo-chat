// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { Todo } from "../../shared/types.js";
import { ClaudeService } from "./claude.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock MessageStream that yields the given text chunks via async iteration. */
function createMockStream(chunks: string[]) {
  const events = chunks.map((text) => ({
    type: "content_block_delta" as const,
    index: 0,
    delta: { type: "text_delta" as const, text },
  }));

  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: async () => ({
      id: "msg_test",
      type: "message" as const,
      role: "assistant" as const,
      content: [{ type: "text" as const, text: chunks.join("") }],
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "end_turn" as const,
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
  };
}

/** Build a minimal mock of the Anthropic SDK client. */
function createMockClient(
  streamReturn: ReturnType<typeof createMockStream>,
): { client: Anthropic; streamSpy: ReturnType<typeof vi.fn> } {
  const streamSpy = vi.fn().mockReturnValue(streamReturn);
  const client = {
    messages: { stream: streamSpy },
  } as unknown as Anthropic;
  return { client, streamSpy };
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

/** Consume the async generator fully, collecting yielded chunks and the return value. */
async function consumeStream(
  gen: AsyncGenerator<string, { fullText: string; suggestions: string[] }>,
): Promise<{ chunks: string[]; result: { fullText: string; suggestions: string[] } }> {
  const chunks: string[] = [];
  let iterResult = await gen.next();
  while (!iterResult.done) {
    chunks.push(iterResult.value);
    iterResult = await gen.next();
  }
  return { chunks, result: iterResult.value };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClaudeService", () => {
  let service: ClaudeService;
  let streamSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = createMockClient(createMockStream(["Hello ", "world!"]));
    service = new ClaudeService(mock.client);
    streamSpy = mock.streamSpy;
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("accepts an Anthropic client and uses default model", () => {
      // The service should be created without error
      expect(service).toBeInstanceOf(ClaudeService);
    });

    it("accepts a custom model", async () => {
      const mock = createMockClient(createMockStream(["hi"]));
      const customService = new ClaudeService(mock.client, "claude-haiku-3");
      const gen = customService.streamChat(
        [{ role: "user", content: "hi" }],
        [],
      );
      await consumeStream(gen);
      expect(mock.streamSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-haiku-3" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // System prompt / todo context
  // -------------------------------------------------------------------------

  describe("system prompt", () => {
    it("includes current todo list in system prompt", async () => {
      const todos = [
        makeTodo({ id: 1, title: "Buy groceries", completed: true }),
        makeTodo({ id: 2, title: "Walk the dog", completed: false }),
      ];

      const gen = service.streamChat(
        [{ role: "user", content: "What should I do?" }],
        todos,
      );
      await consumeStream(gen);

      const systemPrompt = streamSpy.mock.calls[0]![0].system as string;
      expect(systemPrompt).toContain("Current todo list:");
      expect(systemPrompt).toContain("[x] Buy groceries");
      expect(systemPrompt).toContain("[ ] Walk the dog");
    });

    it("shows empty message when no todos exist", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const systemPrompt = streamSpy.mock.calls[0]![0].system as string;
      expect(systemPrompt).toContain("(empty - no todos yet)");
    });

    it("includes SUGGEST_TODO instruction in system prompt", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const systemPrompt = streamSpy.mock.calls[0]![0].system as string;
      expect(systemPrompt).toContain('[SUGGEST_TODO: "title here"]');
    });
  });

  // -------------------------------------------------------------------------
  // Streaming
  // -------------------------------------------------------------------------

  describe("streaming", () => {
    it("yields text chunks as they arrive", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      const { chunks } = await consumeStream(gen);

      expect(chunks).toEqual(["Hello ", "world!"]);
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

      const callArgs = streamSpy.mock.calls[0]![0];
      expect(callArgs.messages).toEqual(messages);
    });

    it("sets max_tokens in the request", async () => {
      const gen = service.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      await consumeStream(gen);

      const callArgs = streamSpy.mock.calls[0]![0];
      expect(callArgs.max_tokens).toBe(1024);
    });

    it("ignores non-text-delta events in the stream", async () => {
      // Create a stream that includes non-text events
      const mixedEvents = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "message_start" as const,
            message: { id: "msg_test" },
          };
          yield {
            type: "content_block_delta" as const,
            index: 0,
            delta: { type: "text_delta" as const, text: "Hello" },
          };
          yield {
            type: "content_block_stop" as const,
            index: 0,
          };
          yield {
            type: "content_block_delta" as const,
            index: 0,
            delta: { type: "text_delta" as const, text: " there" },
          };
          yield {
            type: "message_stop" as const,
          };
        },
        finalMessage: async () => ({
          id: "msg_test",
          type: "message" as const,
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "Hello there" }],
          model: "claude-sonnet-4-5-20250929",
          stop_reason: "end_turn" as const,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      };

      const mock = createMockClient(
        mixedEvents as unknown as ReturnType<typeof createMockStream>,
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      const { chunks, result } = await consumeStream(gen);

      expect(chunks).toEqual(["Hello", " there"]);
      expect(result.fullText).toBe("Hello there");
    });
  });

  // -------------------------------------------------------------------------
  // Suggestion extraction
  // -------------------------------------------------------------------------

  describe("suggestion extraction", () => {
    it("extracts a single suggestion from response", async () => {
      const mock = createMockClient(
        createMockStream([
          'Sure! ',
          '[SUGGEST_TODO: "Buy milk"]',
          ' Done.',
        ]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add a todo" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.suggestions).toEqual(["Buy milk"]);
      expect(result.fullText).toBe("Sure!  Done.");
    });

    it("extracts multiple suggestions from response", async () => {
      const mock = createMockClient(
        createMockStream([
          'Here are some tasks: [SUGGEST_TODO: "Task one"] ',
          'and [SUGGEST_TODO: "Task two"] and [SUGGEST_TODO: "Task three"]',
        ]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Suggest tasks" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.suggestions).toEqual(["Task one", "Task two", "Task three"]);
      expect(result.fullText).toBe("Here are some tasks:  and  and ");
    });

    it("returns empty suggestions when none are present", async () => {
      const mock = createMockClient(
        createMockStream(["Just a regular response."]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.suggestions).toEqual([]);
      expect(result.fullText).toBe("Just a regular response.");
    });

    it("handles escaped quotes in suggestion titles", async () => {
      const mock = createMockClient(
        createMockStream([
          'Here: [SUGGEST_TODO: "Buy \\"fancy\\" cheese"]',
        ]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add a todo" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.suggestions).toEqual(['Buy "fancy" cheese']);
      expect(result.fullText).toBe("Here: ");
    });

    it("handles suggestions split across multiple chunks", async () => {
      const mock = createMockClient(
        createMockStream([
          "Here: [SUGGEST_",
          'TODO: "Split ',
          'across chunks"]',
          " Done.",
        ]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Add a todo" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.suggestions).toEqual(["Split across chunks"]);
      expect(result.fullText).toBe("Here:  Done.");
    });

    it("strips suggestion markers from display text", async () => {
      const mock = createMockClient(
        createMockStream([
          'I suggest: [SUGGEST_TODO: "Walk the dog"] How about that?',
        ]),
      );
      const svc = new ClaudeService(mock.client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Ideas?" }],
        [],
      );
      const { result } = await consumeStream(gen);

      expect(result.fullText).toBe("I suggest:  How about that?");
      expect(result.fullText).not.toContain("SUGGEST_TODO");
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("handles rate limit errors gracefully", async () => {
      const streamSpy = vi.fn().mockImplementation(() => {
        throw Object.assign(new Error("rate_limit_error: Too many requests"), {
          status: 429,
          name: "RateLimitError",
        });
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow(/rate.limit/i);
    });

    it("handles authentication errors gracefully", async () => {
      const streamSpy = vi.fn().mockImplementation(() => {
        throw Object.assign(
          new Error("authentication_error: Invalid API key"),
          { status: 401, name: "AuthenticationError" },
        );
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow(/authentication/i);
    });

    it("handles network errors gracefully", async () => {
      const streamSpy = vi.fn().mockImplementation(() => {
        throw new Error("Connection refused");
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow();
    });

    it("handles errors thrown during streaming iteration", async () => {
      const failingStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "content_block_delta" as const,
            index: 0,
            delta: { type: "text_delta" as const, text: "Hello" },
          };
          throw new Error("Stream interrupted");
        },
        finalMessage: async () => {
          throw new Error("No final message");
        },
      };
      const streamSpy = vi.fn().mockReturnValue(failingStream);
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      // Should get the first chunk, then error
      const first = await gen.next();
      expect(first.value).toBe("Hello");

      await expect(gen.next()).rejects.toThrow(/Stream interrupted/);
    });

    it("never exposes ANTHROPIC_API_KEY pattern in error messages", async () => {
      const streamSpy = vi.fn().mockImplementation(() => {
        throw new Error(
          "Error: Invalid API key sk-ant-api03-abc123xyz provided at /home/app/node_modules/@anthropic-ai/sdk/index.js:42",
        );
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      try {
        await consumeStream(gen);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).not.toMatch(/sk-ant-/);
        expect(message).not.toContain("sk-ant-api03-abc123xyz");
      }
    });

    it("sanitizes file paths from error messages", async () => {
      const streamSpy = vi.fn().mockImplementation(() => {
        throw new Error(
          "ENOENT: no such file or directory at /home/user/.config/anthropic/key",
        );
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
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
      const streamSpy = vi.fn().mockImplementation(() => {
        throw new Error("api_key: sk-ant-secret-value was rejected");
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
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

    it("handles non-Error thrown values from stream creation", async () => {
      const streamSpy = vi.fn().mockImplementation(() => {
        throw "string error";
      });
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      await expect(consumeStream(gen)).rejects.toThrow(
        "An unexpected error occurred",
      );
    });

    it("handles non-Error thrown values during streaming iteration", async () => {
      const failingStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "content_block_delta" as const,
            index: 0,
            delta: { type: "text_delta" as const, text: "Hello" },
          };
          throw 42;
        },
        finalMessage: async () => {
          throw new Error("No final message");
        },
      };
      const streamSpy = vi.fn().mockReturnValue(failingStream);
      const client = { messages: { stream: streamSpy } } as unknown as Anthropic;
      const svc = new ClaudeService(client);

      const gen = svc.streamChat(
        [{ role: "user", content: "Hello" }],
        [],
      );

      const first = await gen.next();
      expect(first.value).toBe("Hello");

      await expect(gen.next()).rejects.toThrow(
        "An unexpected error occurred",
      );
    });
  });

  // -------------------------------------------------------------------------
  // API key handling
  // -------------------------------------------------------------------------

  describe("API key handling", () => {
    it("relies on the injected client for API key management", () => {
      // ClaudeService does not manage the API key directly —
      // it's the responsibility of the injected Anthropic client.
      // This test verifies the service can be constructed without
      // needing to know about the API key.
      const mock = createMockClient(createMockStream(["test"]));
      const svc = new ClaudeService(mock.client);
      expect(svc).toBeInstanceOf(ClaudeService);
    });
  });
});
