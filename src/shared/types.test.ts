import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  Todo,
  ChatMessage,
  TodoSuggestion,
  WebSocketMessage,
  ApiError,
  ClientMessage,
  ServerMessage,
  TodoCreateMessage,
  TodoUpdateMessage,
  TodoDeleteMessage,
  TodoCreatedMessage,
  TodoUpdatedMessage,
  TodoDeletedMessage,
  TodoSyncMessage,
  ErrorMessage,
} from "./types";
import {
  CreateTodoInputSchema,
  UpdateTodoInputSchema,
  ChatMessageInputSchema,
  WebSocketMessageSchema,
} from "./validation";

// ---------------------------------------------------------------------------
// 1. Todo type
// ---------------------------------------------------------------------------
describe("Todo type", () => {
  it("has the correct shape", () => {
    const todo: Todo = {
      id: 1,
      title: "Buy groceries",
      completed: false,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    expect(todo.id).toBe(1);
    expect(todo.title).toBe("Buy groceries");
    expect(todo.completed).toBe(false);
    expect(todo.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(todo.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("enforces required fields at the type level", () => {
    expectTypeOf<Todo>().toHaveProperty("id");
    expectTypeOf<Todo>().toHaveProperty("title");
    expectTypeOf<Todo>().toHaveProperty("completed");
    expectTypeOf<Todo>().toHaveProperty("createdAt");
    expectTypeOf<Todo>().toHaveProperty("updatedAt");

    expectTypeOf<Todo["id"]>().toBeNumber();
    expectTypeOf<Todo["title"]>().toBeString();
    expectTypeOf<Todo["completed"]>().toBeBoolean();
    expectTypeOf<Todo["createdAt"]>().toBeString();
    expectTypeOf<Todo["updatedAt"]>().toBeString();
  });
});

// ---------------------------------------------------------------------------
// 2. ChatMessage type
// ---------------------------------------------------------------------------
describe("ChatMessage type", () => {
  it("has the correct shape", () => {
    const msg: ChatMessage = {
      id: 1,
      role: "user",
      content: "Hello",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    expect(msg.id).toBe(1);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
    expect(msg.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("role is a union of 'user' | 'assistant'", () => {
    expectTypeOf<ChatMessage["role"]>().toEqualTypeOf<"user" | "assistant">();
  });

  it("enforces required fields at the type level", () => {
    expectTypeOf<ChatMessage>().toHaveProperty("id");
    expectTypeOf<ChatMessage>().toHaveProperty("role");
    expectTypeOf<ChatMessage>().toHaveProperty("content");
    expectTypeOf<ChatMessage>().toHaveProperty("createdAt");

    expectTypeOf<ChatMessage["id"]>().toBeNumber();
    expectTypeOf<ChatMessage["content"]>().toBeString();
    expectTypeOf<ChatMessage["createdAt"]>().toBeString();
  });
});

// ---------------------------------------------------------------------------
// 3. TodoSuggestion type
// ---------------------------------------------------------------------------
describe("TodoSuggestion type", () => {
  it("has the correct shape", () => {
    const suggestion: TodoSuggestion = {
      id: 1,
      chatMessageId: 10,
      title: "Walk the dog",
      accepted: false,
    };

    expect(suggestion.id).toBe(1);
    expect(suggestion.chatMessageId).toBe(10);
    expect(suggestion.title).toBe("Walk the dog");
    expect(suggestion.accepted).toBe(false);
  });

  it("enforces required fields at the type level", () => {
    expectTypeOf<TodoSuggestion>().toHaveProperty("id");
    expectTypeOf<TodoSuggestion>().toHaveProperty("chatMessageId");
    expectTypeOf<TodoSuggestion>().toHaveProperty("title");
    expectTypeOf<TodoSuggestion>().toHaveProperty("accepted");

    expectTypeOf<TodoSuggestion["id"]>().toBeNumber();
    expectTypeOf<TodoSuggestion["chatMessageId"]>().toBeNumber();
    expectTypeOf<TodoSuggestion["title"]>().toBeString();
    expectTypeOf<TodoSuggestion["accepted"]>().toBeBoolean();
  });
});

// ---------------------------------------------------------------------------
// 4. WebSocketMessage discriminated union — type narrowing
// ---------------------------------------------------------------------------
describe("WebSocketMessage discriminated union", () => {
  it("narrows to TodoCreateMessage when type is 'todo:create'", () => {
    const msg: WebSocketMessage = {
      type: "todo:create",
      tempId: "abc-123",
      data: { title: "New todo" },
    };

    if (msg.type === "todo:create") {
      expectTypeOf(msg).toEqualTypeOf<TodoCreateMessage>();
      expect(msg.tempId).toBe("abc-123");
      expect(msg.data.title).toBe("New todo");
    }
  });

  it("narrows to TodoUpdateMessage when type is 'todo:update'", () => {
    const msg: WebSocketMessage = {
      type: "todo:update",
      data: { id: 1, title: "Updated", completed: true },
    };

    if (msg.type === "todo:update") {
      expectTypeOf(msg).toEqualTypeOf<TodoUpdateMessage>();
      expect(msg.data.id).toBe(1);
      expect(msg.data.title).toBe("Updated");
      expect(msg.data.completed).toBe(true);
    }
  });

  it("narrows to TodoDeleteMessage when type is 'todo:delete'", () => {
    const msg: WebSocketMessage = {
      type: "todo:delete",
      data: { id: 42 },
    };

    if (msg.type === "todo:delete") {
      expectTypeOf(msg).toEqualTypeOf<TodoDeleteMessage>();
      expect(msg.data.id).toBe(42);
    }
  });

  it("narrows to TodoCreatedMessage when type is 'todo:created'", () => {
    const todo: Todo = {
      id: 1,
      title: "Created",
      completed: false,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const msg: WebSocketMessage = {
      type: "todo:created",
      tempId: "abc-123",
      data: todo,
    };

    if (msg.type === "todo:created") {
      expectTypeOf(msg).toEqualTypeOf<TodoCreatedMessage>();
      expect(msg.data.id).toBe(1);
      expect(msg.tempId).toBe("abc-123");
    }
  });

  it("narrows to TodoUpdatedMessage when type is 'todo:updated'", () => {
    const todo: Todo = {
      id: 1,
      title: "Updated",
      completed: true,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    const msg: WebSocketMessage = {
      type: "todo:updated",
      data: todo,
    };

    if (msg.type === "todo:updated") {
      expectTypeOf(msg).toEqualTypeOf<TodoUpdatedMessage>();
      expect(msg.data.completed).toBe(true);
    }
  });

  it("narrows to TodoDeletedMessage when type is 'todo:deleted'", () => {
    const msg: WebSocketMessage = {
      type: "todo:deleted",
      data: { id: 99 },
    };

    if (msg.type === "todo:deleted") {
      expectTypeOf(msg).toEqualTypeOf<TodoDeletedMessage>();
      expect(msg.data.id).toBe(99);
    }
  });

  it("narrows to TodoSyncMessage when type is 'todo:sync'", () => {
    const msg: WebSocketMessage = {
      type: "todo:sync",
      data: [],
    };

    if (msg.type === "todo:sync") {
      expectTypeOf(msg).toEqualTypeOf<TodoSyncMessage>();
      expect(msg.data).toEqual([]);
    }
  });

  it("narrows to ErrorMessage when type is 'error'", () => {
    const msg: WebSocketMessage = {
      type: "error",
      data: { message: "Something went wrong", originalType: "todo:create" },
    };

    if (msg.type === "error") {
      expectTypeOf(msg).toEqualTypeOf<ErrorMessage>();
      expect(msg.data.message).toBe("Something went wrong");
      expect(msg.data.originalType).toBe("todo:create");
    }
  });

  it("ErrorMessage data.originalType is optional", () => {
    const msg: WebSocketMessage = {
      type: "error",
      data: { message: "Generic error" },
    };

    if (msg.type === "error") {
      expect(msg.data.originalType).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 4b. ClientMessage and ServerMessage sub-union types
// ---------------------------------------------------------------------------
describe("ClientMessage sub-union", () => {
  it("includes only client-to-server message types", () => {
    const msg: ClientMessage = {
      type: "todo:create",
      tempId: "t1",
      data: { title: "Test" },
    };
    expect(msg.type).toBe("todo:create");
  });

  it("can be todo:update", () => {
    const msg: ClientMessage = {
      type: "todo:update",
      data: { id: 1, completed: true },
    };
    expect(msg.type).toBe("todo:update");
  });

  it("can be todo:delete", () => {
    const msg: ClientMessage = {
      type: "todo:delete",
      data: { id: 1 },
    };
    expect(msg.type).toBe("todo:delete");
  });
});

describe("ServerMessage sub-union", () => {
  it("includes server-to-client message types", () => {
    const msg: ServerMessage = {
      type: "todo:sync",
      data: [],
    };
    expect(msg.type).toBe("todo:sync");
  });

  it("includes error type", () => {
    const msg: ServerMessage = {
      type: "error",
      data: { message: "fail" },
    };
    expect(msg.type).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 5. ApiError type
// ---------------------------------------------------------------------------
describe("ApiError type", () => {
  it("has the correct shape", () => {
    const err: ApiError = {
      error: {
        code: "NOT_FOUND",
        message: "Todo not found",
      },
    };

    expect(err.error.code).toBe("NOT_FOUND");
    expect(err.error.message).toBe("Todo not found");
  });

  it("enforces structure at the type level", () => {
    expectTypeOf<ApiError>().toHaveProperty("error");
    expectTypeOf<ApiError["error"]>().toHaveProperty("code");
    expectTypeOf<ApiError["error"]>().toHaveProperty("message");

    expectTypeOf<ApiError["error"]["code"]>().toBeString();
    expectTypeOf<ApiError["error"]["message"]>().toBeString();
  });
});

// ---------------------------------------------------------------------------
// 6. CreateTodoInput Zod schema
// ---------------------------------------------------------------------------
describe("CreateTodoInputSchema", () => {
  it("accepts a valid title", () => {
    const result = CreateTodoInputSchema.safeParse({ title: "Buy groceries" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Buy groceries");
    }
  });

  it("trims whitespace from title", () => {
    const result = CreateTodoInputSchema.safeParse({
      title: "  Buy groceries  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Buy groceries");
    }
  });

  it("rejects empty title", () => {
    const result = CreateTodoInputSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only title", () => {
    const result = CreateTodoInputSchema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 500 characters", () => {
    const result = CreateTodoInputSchema.safeParse({
      title: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts title at exactly 500 characters", () => {
    const result = CreateTodoInputSchema.safeParse({
      title: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title field", () => {
    const result = CreateTodoInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string title", () => {
    const result = CreateTodoInputSchema.safeParse({ title: 123 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. UpdateTodoInput Zod schema
// ---------------------------------------------------------------------------
describe("UpdateTodoInputSchema", () => {
  it("accepts id with title update", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: 1,
      title: "Updated title",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(1);
      expect(result.data.title).toBe("Updated title");
    }
  });

  it("accepts id with completed update", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: 1,
      completed: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(1);
      expect(result.data.completed).toBe(true);
    }
  });

  it("accepts id with both title and completed", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: 1,
      title: "New",
      completed: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = UpdateTodoInputSchema.safeParse({ title: "No id" });
    expect(result.success).toBe(false);
  });

  it("rejects empty string title", () => {
    const result = UpdateTodoInputSchema.safeParse({ id: 1, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 500 characters", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: 1,
      title: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from title", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: 1,
      title: "  trimmed  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("trimmed");
    }
  });

  it("rejects non-integer id", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: 1.5,
      title: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative id", () => {
    const result = UpdateTodoInputSchema.safeParse({
      id: -1,
      title: "test",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. ChatMessageInput Zod schema
// ---------------------------------------------------------------------------
describe("ChatMessageInputSchema", () => {
  it("accepts valid content", () => {
    const result = ChatMessageInputSchema.safeParse({
      content: "Hello, world!",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe("Hello, world!");
    }
  });

  it("trims whitespace from content", () => {
    const result = ChatMessageInputSchema.safeParse({
      content: "  Hello  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe("Hello");
    }
  });

  it("rejects empty content", () => {
    const result = ChatMessageInputSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only content", () => {
    const result = ChatMessageInputSchema.safeParse({ content: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects content exceeding 4000 characters", () => {
    const result = ChatMessageInputSchema.safeParse({
      content: "a".repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts content at exactly 4000 characters", () => {
    const result = ChatMessageInputSchema.safeParse({
      content: "a".repeat(4000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing content field", () => {
    const result = ChatMessageInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string content", () => {
    const result = ChatMessageInputSchema.safeParse({ content: 42 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. WebSocketMessageSchema — Zod discriminated union (client->server only)
// ---------------------------------------------------------------------------
describe("WebSocketMessageSchema", () => {
  describe("todo:create", () => {
    it("validates a valid todo:create message", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:create",
        tempId: "temp-1",
        data: { title: "New todo" },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("todo:create");
      }
    });

    it("rejects todo:create with empty title", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:create",
        tempId: "temp-1",
        data: { title: "" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects todo:create without tempId", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:create",
        data: { title: "New todo" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects todo:create with title exceeding 500 chars", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:create",
        tempId: "temp-1",
        data: { title: "a".repeat(501) },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("todo:update", () => {
    it("validates a valid todo:update message with title", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:update",
        data: { id: 1, title: "Updated" },
      });
      expect(result.success).toBe(true);
    });

    it("validates a valid todo:update message with completed", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:update",
        data: { id: 1, completed: true },
      });
      expect(result.success).toBe(true);
    });

    it("validates a valid todo:update message with both fields", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:update",
        data: { id: 1, title: "Updated", completed: false },
      });
      expect(result.success).toBe(true);
    });

    it("rejects todo:update without id", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:update",
        data: { title: "No id" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects todo:update with empty title", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:update",
        data: { id: 1, title: "" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("todo:delete", () => {
    it("validates a valid todo:delete message", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:delete",
        data: { id: 42 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("todo:delete");
      }
    });

    it("rejects todo:delete without id", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:delete",
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects todo:delete with non-integer id", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:delete",
        data: { id: 1.5 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects todo:delete with negative id", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:delete",
        data: { id: -1 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("unknown message types", () => {
    it("rejects unknown message types", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "unknown:type",
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects server-side message types", () => {
      const result = WebSocketMessageSchema.safeParse({
        type: "todo:created",
        data: {
          id: 1,
          title: "test",
          completed: false,
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = WebSocketMessageSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects non-object input", () => {
      const result = WebSocketMessageSchema.safeParse("not an object");
      expect(result.success).toBe(false);
    });

    it("rejects null input", () => {
      const result = WebSocketMessageSchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });
});
