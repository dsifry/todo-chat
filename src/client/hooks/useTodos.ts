import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Todo,
  ConnectionStatus,
  ServerMessage,
  ClientMessage,
} from "../types/index.js";
import { useWebSocket } from "./useWebSocket.js";

export interface UseTodosOptions {
  /** When true, connects to WebSocket for real-time sync. Defaults to false. */
  enableWebSocket?: boolean;
}

export function useTodos(options: UseTodosOptions = {}) {
  const { enableWebSocket = false } = options;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");

  // Track pending optimistic creates by tempId
  const pendingCreatesRef = useRef<Map<string, Todo>>(new Map());

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "todo:created": {
        const { tempId, data } = msg;
        if (tempId && pendingCreatesRef.current.has(tempId)) {
          // Reconcile optimistic create with server-confirmed todo
          pendingCreatesRef.current.delete(tempId);
          setTodos((prev) =>
            prev.map((t) =>
              "tempId" in t &&
              (t as Todo & { tempId?: string }).tempId === tempId
                ? data
                : t,
            ),
          );
        } else {
          // Server-initiated create from another client
          setTodos((prev) => {
            // Avoid duplicates
            if (prev.some((t) => t.id === data.id)) return prev;
            return [data, ...prev];
          });
        }
        break;
      }
      case "todo:updated": {
        setTodos((prev) =>
          prev.map((t) => (t.id === msg.data.id ? msg.data : t)),
        );
        break;
      }
      case "todo:deleted": {
        setTodos((prev) => prev.filter((t) => t.id !== msg.data.id));
        break;
      }
      case "todo:sync": {
        setTodos(msg.data);
        break;
      }
      case "error": {
        setError(msg.data.message);
        break;
      }
    }
  }, []);

  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
  }, []);

  // Conditionally use WebSocket - always call the hook but use a no-op when disabled
  const ws = useWebSocket({
    onMessage: handleServerMessage,
    onStatusChange: handleStatusChange,
    enabled: enableWebSocket,
  });

  const wsConnected =
    enableWebSocket && ws.connectionStatus === "connected";

  const sendWsMessage = useCallback(
    (msg: ClientMessage) => {
      ws.sendMessage(msg);
    },
    [ws],
  );

  const fetchTodos = useCallback(async () => {
    try {
      const response = await fetch("/api/todos");
      if (!response.ok) throw new Error("Failed to fetch todos");
      const data = (await response.json()) as Todo[];
      setTodos(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTodos();
  }, [fetchTodos]);

  const addTodo = useCallback(
    async (title: string) => {
      if (wsConnected) {
        const tempId = crypto.randomUUID();
        const optimisticTodo: Todo & { tempId: string } = {
          id: -Date.now(),
          title,
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tempId,
        };
        pendingCreatesRef.current.set(tempId, optimisticTodo);
        setTodos((prev) => [optimisticTodo, ...prev]);
        sendWsMessage({ type: "todo:create", tempId, data: { title } });
        return;
      }

      try {
        const response = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!response.ok) throw new Error("Failed to create todo");
        const newTodo = (await response.json()) as Todo;
        setTodos((prev) => [newTodo, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [wsConnected, sendWsMessage],
  );

  const toggleTodo = useCallback(
    async (id: number) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) return;

      if (wsConnected) {
        // Optimistic update
        const newCompleted = !todo.completed;
        setTodos((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, completed: newCompleted } : t,
          ),
        );
        sendWsMessage({
          type: "todo:update",
          data: { id, completed: newCompleted },
        });
        return;
      }

      try {
        const response = await fetch(`/api/todos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: !todo.completed }),
        });
        if (!response.ok) throw new Error("Failed to update todo");
        const updated = (await response.json()) as Todo;
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [todos, wsConnected, sendWsMessage],
  );

  const updateTodo = useCallback(
    async (id: number, title: string) => {
      if (wsConnected) {
        // Optimistic update
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title } : t)),
        );
        sendWsMessage({
          type: "todo:update",
          data: { id, title },
        });
        return;
      }

      try {
        const response = await fetch(`/api/todos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!response.ok) throw new Error("Failed to update todo");
        const updated = (await response.json()) as Todo;
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [wsConnected, sendWsMessage],
  );

  const deleteTodo = useCallback(
    async (id: number) => {
      if (wsConnected) {
        // Optimistic delete
        setTodos((prev) => prev.filter((t) => t.id !== id));
        sendWsMessage({ type: "todo:delete", data: { id } });
        return;
      }

      try {
        const response = await fetch(`/api/todos/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Failed to delete todo");
        setTodos((prev) => prev.filter((t) => t.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [wsConnected, sendWsMessage],
  );

  return {
    todos,
    isLoading,
    error,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    setTodos,
    connectionStatus,
    sendWsMessage,
    disconnectWs: ws.disconnect,
  };
}
