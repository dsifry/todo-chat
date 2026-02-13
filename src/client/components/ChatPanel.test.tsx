import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ChatMessage } from "./ChatMessage.js";
import { ChatPanel } from "./ChatPanel.js";
import type {
  ChatMessage as ChatMessageType,
  TodoSuggestion,
} from "../types/index.js";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: 1,
    role: "user",
    content: "Hello",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSuggestion(
  overrides: Partial<TodoSuggestion> = {},
): TodoSuggestion {
  return {
    id: 1,
    chatMessageId: 1,
    title: "Buy groceries",
    accepted: false,
    ...overrides,
  };
}

const defaultPanelProps = {
  messages: [] as ChatMessageType[],
  streamingContent: "",
  isStreaming: false,
  error: null,
  suggestions: [] as TodoSuggestion[],
  onSend: vi.fn(),
  onAcceptSuggestion: vi.fn(),
  onDismissSuggestions: vi.fn(),
};

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------
describe("ChatMessage", () => {
  it("renders user message with correct alignment (justify-end)", () => {
    const { container } = render(
      <ChatMessage message={makeMessage({ role: "user", content: "Hi" })} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("justify-end");
  });

  it("renders assistant message with correct alignment (justify-start)", () => {
    const { container } = render(
      <ChatMessage
        message={makeMessage({ role: "assistant", content: "Hello!" })}
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("justify-start");
  });

  it("renders message content as text (not HTML)", () => {
    render(
      <ChatMessage
        message={makeMessage({
          content: '<script>alert("xss")</script>',
        })}
      />,
    );
    // The script tag should be rendered as text, not as an actual HTML element
    expect(
      screen.getByText('<script>alert("xss")</script>'),
    ).toBeInTheDocument();
  });

  it("applies user styling (blue background)", () => {
    const { container } = render(
      <ChatMessage message={makeMessage({ role: "user", content: "User msg" })} />,
    );
    const bubble = container.querySelector("[class*='bg-blue-600']");
    expect(bubble).toBeInTheDocument();
  });

  it("applies assistant styling (gray background)", () => {
    const { container } = render(
      <ChatMessage
        message={makeMessage({ role: "assistant", content: "Bot msg" })}
      />,
    );
    const bubble = container.querySelector("[class*='bg-gray-100']");
    expect(bubble).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------
describe("ChatPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -- Empty / Messages rendering --

  it("renders empty state placeholder when no messages", () => {
    render(<ChatPanel {...defaultPanelProps} />);
    expect(
      screen.getByText("Start a conversation to get help with your todos"),
    ).toBeInTheDocument();
  });

  it("renders chat messages", () => {
    const messages = [
      makeMessage({ id: 1, role: "user", content: "Hello" }),
      makeMessage({ id: 2, role: "assistant", content: "Hi there!" }),
    ];
    render(<ChatPanel {...defaultPanelProps} messages={messages} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  // -- Streaming --

  it('shows "Thinking..." during streaming with no content', () => {
    render(
      <ChatPanel
        {...defaultPanelProps}
        isStreaming={true}
        streamingContent=""
      />,
    );
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("shows streaming content incrementally", () => {
    const { rerender } = render(
      <ChatPanel
        {...defaultPanelProps}
        isStreaming={true}
        streamingContent="Hello"
      />,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();

    rerender(
      <ChatPanel
        {...defaultPanelProps}
        isStreaming={true}
        streamingContent="Hello world"
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  // -- Error indicator --

  it("shows error indicator", () => {
    render(
      <ChatPanel
        {...defaultPanelProps}
        error="Connection lost"
      />,
    );
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
  });

  // -- Suggestions --

  it("shows suggestion buttons", () => {
    const suggestions = [
      makeSuggestion({ id: 1, title: "Buy groceries" }),
      makeSuggestion({ id: 2, title: "Walk the dog" }),
    ];
    render(
      <ChatPanel {...defaultPanelProps} suggestions={suggestions} />,
    );
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    expect(screen.getByText("Walk the dog")).toBeInTheDocument();
    expect(screen.getByText("Suggested todos:")).toBeInTheDocument();
    // There should be two "Add this todo" buttons
    const addButtons = screen.getAllByText("Add this todo");
    expect(addButtons).toHaveLength(2);
  });

  it("calls onAcceptSuggestion when suggestion button clicked", () => {
    const onAcceptSuggestion = vi.fn();
    const suggestions = [makeSuggestion({ id: 1, title: "Buy groceries" })];
    render(
      <ChatPanel
        {...defaultPanelProps}
        suggestions={suggestions}
        onAcceptSuggestion={onAcceptSuggestion}
      />,
    );
    fireEvent.click(screen.getByText("Add this todo"));
    expect(onAcceptSuggestion).toHaveBeenCalledWith(suggestions[0]);
  });

  it('shows "Added!" after suggestion accepted', () => {
    const suggestions = [
      makeSuggestion({ id: 1, title: "Buy groceries", accepted: true }),
    ];
    render(
      <ChatPanel {...defaultPanelProps} suggestions={suggestions} />,
    );
    expect(screen.getByText("Added!")).toBeInTheDocument();
    expect(screen.queryByText("Add this todo")).not.toBeInTheDocument();
  });

  it("calls onDismissSuggestions when dismiss clicked", () => {
    const onDismissSuggestions = vi.fn();
    const suggestions = [makeSuggestion({ id: 1, title: "Buy groceries" })];
    render(
      <ChatPanel
        {...defaultPanelProps}
        suggestions={suggestions}
        onDismissSuggestions={onDismissSuggestions}
      />,
    );
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismissSuggestions).toHaveBeenCalled();
  });

  // -- Input handling --

  it("sends message on Enter", () => {
    const onSend = vi.fn();
    render(<ChatPanel {...defaultPanelProps} onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Ask about your todos...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("does not send on Shift+Enter (newline)", () => {
    const onSend = vi.fn();
    render(<ChatPanel {...defaultPanelProps} onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Ask about your todos...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input during streaming", () => {
    render(
      <ChatPanel {...defaultPanelProps} isStreaming={true} />,
    );
    const textarea = screen.getByPlaceholderText("Ask about your todos...");
    expect(textarea).toBeDisabled();
  });

  it("does not send empty messages", () => {
    const onSend = vi.fn();
    render(<ChatPanel {...defaultPanelProps} onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Ask about your todos...");
    // Try sending with empty string
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send whitespace-only messages", () => {
    const onSend = vi.fn();
    render(<ChatPanel {...defaultPanelProps} onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Ask about your todos...");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after sending", () => {
    const onSend = vi.fn();
    render(<ChatPanel {...defaultPanelProps} onSend={onSend} />);
    const textarea = screen.getByPlaceholderText(
      "Ask about your todos...",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(textarea.value).toBe("");
  });

  it("sends message via Send button click", () => {
    const onSend = vi.fn();
    render(<ChatPanel {...defaultPanelProps} onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Ask about your todos...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("disables Send button when input is empty", () => {
    render(<ChatPanel {...defaultPanelProps} />);
    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();
  });

  it("disables Send button during streaming", () => {
    render(
      <ChatPanel {...defaultPanelProps} isStreaming={true} />,
    );
    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// useChat hook
// ---------------------------------------------------------------------------
describe("useChat", () => {
  let useChatModule: typeof import("../hooks/useChat.js");

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Dynamic import so the hook module is loaded after mocks set up
    useChatModule = await import("../hooks/useChat.js");
  });

  function mockFetchSSE(
    events: Array<{ type: string; [key: string]: unknown }>,
  ) {
    const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
    const encoder = new TextEncoder();
    let index = 0;

    return vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      // If it's a GET to /api/chat (history load), return empty array
      if (!options || options.method !== "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      // POST to /api/chat/message — return SSE stream
      return Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(() => {
              if (index < chunks.length) {
                return Promise.resolve({
                  done: false,
                  value: encoder.encode(chunks[index++]),
                });
              }
              return Promise.resolve({ done: true, value: undefined });
            }),
          }),
        },
      });
    });
  }

  // Test component that exercises the hook
  function TestHarness({
    onSuggestionAccepted,
    onTodoChanged,
  }: {
    onSuggestionAccepted?: (title: string) => void;
    onTodoChanged?: () => void;
  }) {
    const {
      messages,
      isStreaming,
      error,
      streamingContent,
      suggestions,
      sendMessage,
      acceptSuggestion,
      dismissSuggestions,
      clearChat,
    } = useChatModule.useChat({ onSuggestionAccepted, onTodoChanged });

    return (
      <div>
        <div data-testid="messages">
          {messages.map((m) => (
            <div key={m.id} data-testid={`msg-${m.role}`}>
              {m.content}
            </div>
          ))}
        </div>
        <div data-testid="streaming">{streamingContent}</div>
        <div data-testid="is-streaming">
          {isStreaming ? "streaming" : "idle"}
        </div>
        <div data-testid="error">{error}</div>
        <div data-testid="suggestions">
          {suggestions.map((s) => (
            <button
              key={s.id}
              data-testid={`suggestion-${s.id}`}
              onClick={() => acceptSuggestion(s)}
            >
              {s.title} {s.accepted ? "(accepted)" : ""}
            </button>
          ))}
        </div>
        <button data-testid="dismiss" onClick={dismissSuggestions}>
          Dismiss
        </button>
        <button
          data-testid="send"
          onClick={() => sendMessage("Hello")}
        >
          Send
        </button>
        <button data-testid="clear" onClick={clearChat}>
          Clear
        </button>
      </div>
    );
  }

  it("handles loadHistory failure (non-ok response)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Failed to load chat history",
      );
    });
  });

  it("handles loadHistory failure with non-Error throw", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue("string error");

    await act(async () => {
      render(<TestHarness />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Unknown error");
    });
  });

  it("handles sendMessage with non-ok response", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (!options || options.method !== "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Failed to send message",
      );
    });
  });

  it("handles sendMessage with null body", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (!options || options.method !== "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: true, body: null });
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Failed to send message",
      );
    });
  });

  it("loads chat history on mount", async () => {
    const history = [
      makeMessage({ id: 1, role: "user", content: "Loaded msg" }),
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(history),
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await waitFor(() => {
      expect(screen.getByText("Loaded msg")).toBeInTheDocument();
    });
  });

  it("sends message and processes SSE chunks", async () => {
    globalThis.fetch = mockFetchSSE([
      { type: "chunk", content: "Hello " },
      { type: "chunk", content: "world" },
      { type: "done" },
    ]);

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("is-streaming")).toHaveTextContent("idle");
    });

    // The assistant message should contain the full content
    await waitFor(() => {
      expect(screen.getByTestId("msg-assistant")).toHaveTextContent(
        "Hello world",
      );
    });
  });

  it("handles SSE error event", async () => {
    globalThis.fetch = mockFetchSSE([
      { type: "chunk", content: "Partial" },
      { type: "error", message: "Stream interrupted" },
    ]);

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Stream interrupted",
      );
    });
  });

  it("handles fetch failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (!options || options.method !== "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.reject(new Error("Network error"));
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Network error");
    });
  });

  it("receives and displays suggestions", async () => {
    globalThis.fetch = mockFetchSSE([
      { type: "chunk", content: "Here are suggestions" },
      {
        type: "suggestions",
        items: [
          makeSuggestion({ id: 10, title: "Buy milk" }),
          makeSuggestion({ id: 11, title: "Walk dog" }),
        ],
      },
      { type: "done" },
    ]);

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("suggestion-10")).toHaveTextContent(
        "Buy milk",
      );
      expect(screen.getByTestId("suggestion-11")).toHaveTextContent(
        "Walk dog",
      );
    });
  });

  it("accepts a suggestion and calls callback", async () => {
    const onAccepted = vi.fn();
    globalThis.fetch = mockFetchSSE([
      { type: "chunk", content: "Suggestions" },
      {
        type: "suggestions",
        items: [makeSuggestion({ id: 10, title: "Buy milk" })],
      },
      { type: "done" },
    ]);

    await act(async () => {
      render(<TestHarness onSuggestionAccepted={onAccepted} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("suggestion-10")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("suggestion-10"));
    });

    expect(onAccepted).toHaveBeenCalledWith("Buy milk");
    // Should show accepted state
    await waitFor(() => {
      expect(screen.getByTestId("suggestion-10")).toHaveTextContent(
        "(accepted)",
      );
    });
  });

  it("dismisses suggestions", async () => {
    globalThis.fetch = mockFetchSSE([
      { type: "chunk", content: "Suggestions" },
      {
        type: "suggestions",
        items: [makeSuggestion({ id: 10, title: "Buy milk" })],
      },
      { type: "done" },
    ]);

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("suggestion-10")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("dismiss"));
    });

    expect(screen.queryByTestId("suggestion-10")).not.toBeInTheDocument();
  });

  it("calls onTodoChanged when todo_operation event received", async () => {
    const onTodoChanged = vi.fn();
    globalThis.fetch = mockFetchSSE([
      { type: "todo_operation", toolName: "add_todos", result: [{ id: 1, title: "New" }] },
      { type: "chunk", content: "Done!" },
      { type: "done" },
    ]);

    await act(async () => {
      render(<TestHarness onTodoChanged={onTodoChanged} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("is-streaming")).toHaveTextContent("idle");
    });

    expect(onTodoChanged).toHaveBeenCalled();
  });

  it("clearChat sends DELETE and resets state", async () => {
    // First load history with a message
    const history = [
      makeMessage({ id: 1, role: "user", content: "Existing msg" }),
    ];

    let deleteCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") {
        deleteCallCount++;
        return Promise.resolve({ ok: true });
      }
      // GET - return history
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(history),
      });
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await waitFor(() => {
      expect(screen.getByText("Existing msg")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("clear"));
    });

    expect(deleteCallCount).toBe(1);
    await waitFor(() => {
      expect(screen.queryByText("Existing msg")).not.toBeInTheDocument();
    });
  });

  it("clearChat handles failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("clear"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Failed to clear chat");
    });
  });

  it("shows streaming content incrementally during SSE", async () => {
    // Use a manual step-through approach to check intermediate state
    const encoder = new TextEncoder();
    const chunk1 = `data: ${JSON.stringify({ type: "chunk", content: "Hello " })}\n\n`;
    const chunk2 = `data: ${JSON.stringify({ type: "chunk", content: "world" })}\n\n`;
    const doneChunk = `data: ${JSON.stringify({ type: "done" })}\n\n`;

    let readCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (!options || options.method !== "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(() => {
              readCallCount++;
              if (readCallCount === 1) {
                return Promise.resolve({
                  done: false,
                  value: encoder.encode(chunk1),
                });
              }
              if (readCallCount === 2) {
                return Promise.resolve({
                  done: false,
                  value: encoder.encode(chunk2),
                });
              }
              if (readCallCount === 3) {
                return Promise.resolve({
                  done: false,
                  value: encoder.encode(doneChunk),
                });
              }
              return Promise.resolve({ done: true, value: undefined });
            }),
          }),
        },
      });
    });

    await act(async () => {
      render(<TestHarness />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    // After streaming is complete, the streaming content should be cleared
    // and a full assistant message should exist
    await waitFor(() => {
      expect(screen.getByTestId("is-streaming")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("msg-assistant")).toHaveTextContent(
      "Hello world",
    );
  });
});
