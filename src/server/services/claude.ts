import Anthropic from "@anthropic-ai/sdk";
import type { Todo } from "../../shared/types.js";
import { sanitizeErrorMessage } from "../index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamChatResult {
  /** Complete response text (concatenation of all text blocks). */
  fullText: string;
}

export interface ToolCallResult {
  toolName: string;
  toolUseId: string;
  result: unknown;
  error?: string;
}

/** Callback to execute a tool. Keeps ClaudeService decoupled from TodoService. */
export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
) => Promise<{ result: unknown; error?: string }>;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_todos",
    description:
      "Retrieve the current todo list, optionally filtered by status.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["all", "completed", "pending"],
          description:
            'Filter by completion status. Defaults to "all" if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: "add_todos",
    description: "Add one or more new todos.",
    input_schema: {
      type: "object" as const,
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "The title of the todo to add.",
              },
            },
            required: ["title"],
          },
          description: "Array of todos to add.",
        },
      },
      required: ["todos"],
    },
  },
  {
    name: "update_todos",
    description: "Update one or more existing todos by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number", description: "The todo ID to update." },
              title: {
                type: "string",
                description: "New title (omit to keep current).",
              },
              completed: {
                type: "boolean",
                description: "New completion status (omit to keep current).",
              },
            },
            required: ["id"],
          },
          description: "Array of todo updates.",
        },
      },
      required: ["todos"],
    },
  },
  {
    name: "delete_todos",
    description: "Delete one or more todos by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        todo_ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of todo IDs to delete.",
        },
      },
      required: ["todo_ids"],
    },
  },
  {
    name: "search_todos",
    description: "Search todos by title text.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query to match against todo titles.",
        },
      },
      required: ["query"],
    },
  },
];

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
            return `- ${checkbox} ${t.title} (id: ${t.id})`;
          })
          .join("\n");

  return [
    "You are a helpful AI assistant for a todo list application.",
    "You help users manage their tasks using the provided tools.",
    "",
    "Current todo list:",
    todoSection,
    "",
    "Use the tools to add, update, delete, search, or query todos.",
    "Always use tools to make changes — never just describe what you would do.",
    "After using a tool, confirm what you did in your response.",
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
   * Stream a chat response from Claude with multi-turn tool use.
   *
   * Yields text chunks (string) and ToolCallResult objects as they happen.
   * Returns a StreamChatResult with the complete response text.
   */
  async *streamChat(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    todos: Todo[],
    toolExecutor?: ToolExecutor,
  ): AsyncGenerator<string | ToolCallResult, StreamChatResult> {
    const systemPrompt = buildSystemPrompt(todos);
    let fullText = "";

    // Build initial API messages
    let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Multi-turn loop: keeps going until Claude stops with end_turn
    while (true) {
      let response: Anthropic.Message;

      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: systemPrompt,
          tools: TOOL_DEFINITIONS,
          messages: apiMessages,
        });
      } catch (err: unknown) {
        throw new Error(
          sanitizeErrorMessage(
            err instanceof Error
              ? err.message
              : "An unexpected error occurred",
          ),
        );
      }

      // Process content blocks
      const toolUseBlocks: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          yield block.text;
          fullText += block.text;
        } else if (block.type === "tool_use") {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      // If no tool calls or no executor, we're done
      if (toolUseBlocks.length === 0 || !toolExecutor) {
        break;
      }

      // Execute tools and yield results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolCall of toolUseBlocks) {
        const { result, error } = await toolExecutor(
          toolCall.name,
          toolCall.input,
        );

        const toolCallResult: ToolCallResult = {
          toolName: toolCall.name,
          toolUseId: toolCall.id,
          result,
          error,
        };
        yield toolCallResult;

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(error ? { error } : result),
          is_error: !!error,
        });
      }

      // Build next turn: assistant message with content blocks + tool results
      apiMessages = [
        ...apiMessages,
        {
          role: "assistant" as const,
          content: response.content,
        },
        {
          role: "user" as const,
          content: toolResults,
        },
      ];

      // If stop_reason is end_turn, we're done (shouldn't happen with tool_use blocks, but safety)
      if (response.stop_reason === "end_turn") {
        break;
      }
    }

    return { fullText };
  }
}
