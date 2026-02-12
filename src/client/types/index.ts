import type { Todo, ChatMessage } from "../../shared/types.js";

// Re-export all shared types
export type {
  Todo,
  ChatMessage,
  TodoSuggestion,
  ApiError,
  ClientMessage,
  ServerMessage,
  WebSocketMessage,
  TodoCreateMessage,
  TodoUpdateMessage,
  TodoDeleteMessage,
  TodoCreatedMessage,
  TodoUpdatedMessage,
  TodoDeletedMessage,
  TodoSyncMessage,
  ErrorMessage,
} from "../../shared/types.js";

// Client-only types
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface TodoListProps {
  todos: Todo[];
  onAdd: (title: string) => void;
  onToggle: (id: number) => void;
  onUpdate: (id: number, title: string) => void;
  onDelete: (id: number) => void;
  isLoading: boolean;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  isStreaming: boolean;
  connectionStatus: ConnectionStatus;
}
