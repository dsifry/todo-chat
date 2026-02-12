import type { Queries } from "../db/queries.js";
import type { ClaudeService, StreamChatResult } from "./claude.js";
import type { ChatMessage, TodoSuggestion } from "../../shared/types.js";
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
// Service
// ---------------------------------------------------------------------------

export class ChatService {
  private readonly queries: Queries;
  private readonly claudeService: ClaudeService;

  constructor(queries: Queries, claudeService: ClaudeService) {
    this.queries = queries;
    this.claudeService = claudeService;
  }

  /** Return all chat messages ordered by creation time. */
  getHistory(): ChatMessage[] {
    return this.queries.getChatHistory();
  }

  /**
   * Send a user message and stream the assistant response.
   *
   * Orchestration:
   * 1. Validate input with Zod
   * 2. Persist user message
   * 3. Get chat history (for context) and all todos
   * 4. Stream from ClaudeService, yielding chunks
   * 5. After stream completes, persist assistant message
   * 6. Persist each suggestion
   * 7. Return result
   */
  async *sendMessage(
    content: string,
  ): AsyncGenerator<
    string,
    { assistantMessage: ChatMessage; suggestions: TodoSuggestion[] }
  > {
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

    // 4. Stream from ClaudeService
    const messages = history.map((m) => ({ role: m.role, content: m.content }));
    const stream = this.claudeService.streamChat(messages, todos);

    let streamResult: StreamChatResult;
    try {
      let iterResult = await stream.next();
      while (!iterResult.done) {
        yield iterResult.value;
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

    // 5. Persist assistant message
    const assistantMessage = this.queries.createChatMessage(
      "assistant",
      streamResult.fullText,
    );

    // 6. Persist each suggestion
    const suggestions: TodoSuggestion[] = streamResult.suggestions.map(
      (title) => this.queries.createTodoSuggestion(assistantMessage.id, title),
    );

    // 7. Return result
    return { assistantMessage, suggestions };
  }
}
