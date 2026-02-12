import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

/** Non-empty string up to 500 chars (trimmed before validation). */
const todoTitleSchema = z.string().trim().min(1).max(500);

/** Positive integer id. */
const positiveIntSchema = z.number().int().positive();

// ---------------------------------------------------------------------------
// REST / form input schemas
// ---------------------------------------------------------------------------

/** Schema for creating a new todo. */
export const CreateTodoInputSchema = z.object({
  title: todoTitleSchema,
});
export type CreateTodoInput = z.infer<typeof CreateTodoInputSchema>;

/** Schema for updating an existing todo (id required, title and completed optional). */
export const UpdateTodoInputSchema = z.object({
  id: positiveIntSchema,
  title: todoTitleSchema.optional(),
  completed: z.boolean().optional(),
});
export type UpdateTodoInput = z.infer<typeof UpdateTodoInputSchema>;

/** Schema for a user chat message. */
export const ChatMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>;

// ---------------------------------------------------------------------------
// WebSocket message schemas (CLIENT -> SERVER only)
// ---------------------------------------------------------------------------

const TodoCreateMessageSchema = z.object({
  type: z.literal("todo:create"),
  tempId: z.string().min(1),
  data: z.object({
    title: todoTitleSchema,
  }),
});

const TodoUpdateMessageSchema = z.object({
  type: z.literal("todo:update"),
  data: z.object({
    id: positiveIntSchema,
    title: todoTitleSchema.optional(),
    completed: z.boolean().optional(),
  }),
});

const TodoDeleteMessageSchema = z.object({
  type: z.literal("todo:delete"),
  data: z.object({
    id: positiveIntSchema,
  }),
});

/**
 * Zod discriminated union for validating all incoming WebSocket messages
 * (client -> server only). Messages that do not match one of the three
 * client message types will be rejected.
 */
export const WebSocketMessageSchema = z.discriminatedUnion("type", [
  TodoCreateMessageSchema,
  TodoUpdateMessageSchema,
  TodoDeleteMessageSchema,
]);
export type WebSocketMessageInput = z.infer<typeof WebSocketMessageSchema>;
