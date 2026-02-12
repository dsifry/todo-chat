import Anthropic from "@anthropic-ai/sdk";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import type { Todo } from "../../shared/types.js";
import { sanitizeErrorMessage } from "../index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamChatResult {
  /** Complete response text with suggestion markers stripped. */
  fullText: string;
  /** Extracted suggestion titles. */
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Suggestion parsing
// ---------------------------------------------------------------------------

/** Regex to match `[SUGGEST_TODO: "..."]` markers, supporting escaped quotes. */
const SUGGEST_TODO_REGEX = /\[SUGGEST_TODO:\s*"((?:[^"\\]|\\.)*)"\]/g;

/**
 * Extract SUGGEST_TODO markers from text.
 * Returns the list of suggestion titles (with escape sequences resolved)
 * and the text with all markers stripped.
 */
function extractSuggestions(text: string): {
  cleaned: string;
  suggestions: string[];
} {
  const suggestions: string[] = [];

  const cleaned = text.replace(SUGGEST_TODO_REGEX, (_match, title: string) => {
    // Unescape escaped quotes within the title
    suggestions.push(title.replace(/\\"/g, '"'));
    return "";
  });

  return { cleaned, suggestions };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(todos: Todo[]): string {
  const todoSection =
    todos.length === 0
      ? "(empty - no todos yet)"
      : todos
          .map((t) => {
            const checkbox = t.completed ? "[x]" : "[ ]";
            return `- ${checkbox} ${t.title}`;
          })
          .join("\n");

  return [
    "You are a helpful AI assistant for a todo list application. You help users manage their tasks.",
    "",
    "Current todo list:",
    todoSection,
    "",
    'When you want to suggest adding a new todo, use this exact format: [SUGGEST_TODO: "title here"]',
    "You can suggest multiple todos in one response.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ClaudeService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(client: Anthropic, model?: string) {
    this.client = client;
    this.model = model ?? "claude-sonnet-4-5-20250929";
  }

  /**
   * Stream a chat response from Claude.
   *
   * Yields text chunks as they arrive. When the stream completes, returns a
   * `StreamChatResult` containing the full response (with markers stripped)
   * and any extracted todo suggestions.
   */
  async *streamChat(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    todos: Todo[],
  ): AsyncGenerator<string, StreamChatResult> {
    const systemPrompt = buildSystemPrompt(todos);

    let stream: MessageStream;

    try {
      stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
    } catch (err: unknown) {
      throw new Error(
        sanitizeErrorMessage(
          err instanceof Error ? err.message : "An unexpected error occurred",
        ),
      );
    }

    let fullText = "";

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const { delta } = event;
          if (delta.type === "text_delta") {
            yield delta.text;
            fullText += delta.text;
          }
        }
      }
    } catch (err: unknown) {
      throw new Error(
        sanitizeErrorMessage(
          err instanceof Error ? err.message : "An unexpected error occurred",
        ),
      );
    }

    const { cleaned, suggestions } = extractSuggestions(fullText);

    return {
      fullText: cleaned,
      suggestions,
    };
  }
}
