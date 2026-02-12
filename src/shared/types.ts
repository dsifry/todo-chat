// ---------------------------------------------------------------------------
// Domain types shared between client and server
// ---------------------------------------------------------------------------

/** A single todo item. */
export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A single chat message (user or assistant). */
export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** An AI-suggested todo that can be accepted or dismissed. */
export interface TodoSuggestion {
  id: number;
  chatMessageId: number;
  title: string;
  accepted: boolean;
}

/** Standard API error envelope. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// WebSocket message types — discriminated union on `type`
// ---------------------------------------------------------------------------

// Client -> Server messages

export interface TodoCreateMessage {
  type: "todo:create";
  tempId: string;
  data: { title: string };
}

export interface TodoUpdateMessage {
  type: "todo:update";
  data: {
    id: number;
    title?: string;
    completed?: boolean;
  };
}

export interface TodoDeleteMessage {
  type: "todo:delete";
  data: { id: number };
}

/** Union of all messages the client can send to the server. */
export type ClientMessage =
  | TodoCreateMessage
  | TodoUpdateMessage
  | TodoDeleteMessage;

// Server -> Client messages

export interface TodoCreatedMessage {
  type: "todo:created";
  tempId?: string;
  data: Todo;
}

export interface TodoUpdatedMessage {
  type: "todo:updated";
  data: Todo;
}

export interface TodoDeletedMessage {
  type: "todo:deleted";
  data: { id: number };
}

export interface TodoSyncMessage {
  type: "todo:sync";
  data: Todo[];
}

export interface ErrorMessage {
  type: "error";
  data: {
    message: string;
    originalType?: string;
  };
}

/** Union of all messages the server can send to clients. */
export type ServerMessage =
  | TodoCreatedMessage
  | TodoUpdatedMessage
  | TodoDeletedMessage
  | TodoSyncMessage
  | ErrorMessage;

/** Discriminated union of every WebSocket message type (client + server). */
export type WebSocketMessage = ClientMessage | ServerMessage;
