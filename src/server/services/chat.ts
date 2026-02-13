import type { Queries } from "../db/queries.js";
import type {
  ClaudeService,
  StreamChatResult,
  ToolExecutor,
} from "./claude.js";
import type { TodoService } from "./todo.js";
import type { ChatMessage } from "../../shared/types.js";
import { ChatMessageInputSchema } from "../../shared/validation.js";
import { sanitizeErrorMessage } from "../index.js";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatStreamEvent =
  | { type: "chunk"; content: string }
  | { type: "tool_result"; toolName: string; result: unknown };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ChatService {
  private readonly queries: Queries;
  private readonly claudeService: ClaudeService;
  private readonly todoService: TodoService;

  constructor(
    queries: Queries,
    claudeService: ClaudeService,
    todoService: TodoService,
  ) {
    this.queries = queries;
    this.claudeService = claudeService;
    this.todoService = todoService;
  }

  /** Return all chat messages ordered by creation time. */
  getHistory(): ChatMessage[] {
    return this.queries.getChatHistory();
  }

  /** Clear all chat history. */
  clearHistory(): void {
    this.queries.clearChatHistory();
  }

  /**
   * Send a user message and stream the assistant response.
   *
   * Yields ChatStreamEvent objects:
   * - { type: "chunk", content } for text chunks
   * - { type: "tool_result", toolName, result } for tool call results
   *
   * Returns the persisted assistant message when complete.
   */
  async *sendMessage(
    content: string,
  ): AsyncGenerator<ChatStreamEvent, { assistantMessage: ChatMessage }> {
    // 1. Validate input
    const parseResult = ChatMessageInputSchema.safeParse({ content });
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]!.message);
    }
    const validatedContent = parseResult.data.content;

    // 2. Persist user message
    this.queries.createChatMessage("user", validatedContent);

    // 3. Get chat history and todos for context
    const history = this.queries.getChatHistory();
    const todos = this.queries.getAllTodos();

    // 4. Build tool executor
    const toolExecutor = this.createToolExecutor();

    // 5. Stream from ClaudeService with tool use
    const messages = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const stream = this.claudeService.streamChat(
      messages,
      todos,
      toolExecutor,
    );

    let streamResult: StreamChatResult;
    try {
      let iterResult = await stream.next();
      while (!iterResult.done) {
        const value = iterResult.value;
        if (typeof value === "string") {
          yield { type: "chunk", content: value };
        } else {
          // ToolCallResult
          yield {
            type: "tool_result",
            toolName: value.toolName,
            result: value.result,
          };
        }
        iterResult = await stream.next();
      }
      streamResult = iterResult.value;
    } catch (err: unknown) {
      throw new Error(
        sanitizeErrorMessage(
          err instanceof Error ? err.message : "An unexpected error occurred",
        ),
      );
    }

    // 6. Persist assistant message
    const assistantMessage = this.queries.createChatMessage(
      "assistant",
      streamResult.fullText,
    );

    // 7. Return result
    return { assistantMessage };
  }

  // -------------------------------------------------------------------------
  // Tool executor factory
  // -------------------------------------------------------------------------

  private createToolExecutor(): ToolExecutor {
    return async (
      name: string,
      input: Record<string, unknown>,
    ): Promise<{ result: unknown; error?: string }> => {
      try {
        switch (name) {
          case "get_todos": {
            const status = (input.status as string) ?? "all";
            let todos = this.todoService.getAll();
            if (status === "completed") {
              todos = todos.filter((t) => t.completed);
            } else if (status === "pending") {
              todos = todos.filter((t) => !t.completed);
            }
            return { result: todos };
          }
          case "add_todos": {
            const todosToAdd = input.todos as Array<{ title: string }>;
            const created = todosToAdd.map((t) =>
              this.todoService.create(t.title),
            );
            return { result: created };
          }
          case "update_todos": {
            const todosToUpdate = input.todos as Array<{
              id: number;
              title?: string;
              completed?: boolean;
            }>;
            const updated = todosToUpdate.map((t) =>
              this.todoService.update(t.id, {
                title: t.title,
                completed: t.completed,
              }),
            );
            return { result: updated };
          }
          case "delete_todos": {
            const todoIds = input.todo_ids as number[];
            for (const id of todoIds) {
              this.todoService.delete(id);
            }
            return { result: { deleted: todoIds } };
          }
          case "search_todos": {
            const query = input.query as string;
            const results = this.todoService.search(query);
            return { result: results };
          }
          default:
            return { result: null, error: `Unknown tool: ${name}` };
        }
      } catch (err: unknown) {
        return {
          result: null,
          error: err instanceof Error ? err.message : "Tool execution failed",
        };
      }
    };
  }
}
