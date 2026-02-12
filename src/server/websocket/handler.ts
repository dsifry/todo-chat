import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { TodoService } from "../services/todo.js";
import { NotFoundError, ValidationError } from "../services/todo.js";
import { WebSocketMessageSchema } from "../../shared/validation.js";
import type {
  ServerMessage,
  ErrorMessage,
  TodoCreatedMessage,
  TodoUpdatedMessage,
  TodoDeletedMessage,
  TodoSyncMessage,
} from "../../shared/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebSocketServerOptions {
  allowedOrigins?: string[];
}

interface AliveWebSocket extends WebSocket {
  isAlive: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3001",
];
const HEARTBEAT_INTERVAL_MS = 30_000;
// Clients that don't respond to a ping within one heartbeat cycle (~30s)
// are terminated on the next tick, giving an effective timeout of ~45s.

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWebSocketServer(
  httpServer: http.Server,
  service: TodoService,
  options?: WebSocketServerOptions,
): WebSocketServer {
  const allowedOrigins = options?.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  const clients = new Set<AliveWebSocket>();

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: (
      info: { origin: string },
      callback: (result: boolean, code?: number, message?: string) => void,
    ) => {
      const originAllowed = allowedOrigins.includes(info.origin);
      callback(originAllowed, originAllowed ? undefined : 403, originAllowed ? undefined : "Forbidden");
    },
  });

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  const heartbeatInterval = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  // -------------------------------------------------------------------------
  // Connection handling
  // -------------------------------------------------------------------------

  wss.on("connection", (rawWs: WebSocket) => {
    const ws = rawWs as AliveWebSocket;
    ws.isAlive = true;
    clients.add(ws);

    // Pong handler for heartbeat
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Send initial sync
    const syncMessage: TodoSyncMessage = {
      type: "todo:sync",
      data: service.getAll(),
    };
    ws.send(JSON.stringify(syncMessage));

    // Message handler
    ws.on("message", (rawData) => {
      handleMessage(rawData.toString(), ws, service, clients);
    });

    // Disconnect handler
    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  return wss;
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function handleMessage(
  rawData: string,
  sender: AliveWebSocket,
  service: TodoService,
  clients: Set<AliveWebSocket>,
): void {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    sendError(sender, "Invalid JSON");
    return;
  }

  // Step 2: Validate with Zod
  const result = WebSocketMessageSchema.safeParse(parsed);
  if (!result.success) {
    const originalType =
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as { type: unknown }).type === "string"
        ? (parsed as { type: string }).type
        : undefined;
    const message = result.error.issues
      .map((issue) => issue.message)
      .join("; ");
    sendError(sender, message, originalType);
    return;
  }

  const msg = result.data;

  // Step 3: Dispatch based on type
  try {
    switch (msg.type) {
      case "todo:create":
        handleCreate(msg.data.title, msg.tempId, service, clients);
        break;
      case "todo:update":
        handleUpdate(msg.data, service, clients);
        break;
      case "todo:delete":
        handleDelete(msg.data.id, service, clients);
        break;
    }
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ValidationError) {
      sendError(sender, err.message, msg.type);
    } else {
      sendError(sender, "Internal server error", msg.type);
    }
  }
}

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

function handleCreate(
  title: string,
  tempId: string,
  service: TodoService,
  clients: Set<AliveWebSocket>,
): void {
  const todo = service.create(title);
  const message: TodoCreatedMessage = {
    type: "todo:created",
    tempId,
    data: todo,
  };
  broadcast(clients, message);
}

function handleUpdate(
  data: { id: number; title?: string; completed?: boolean },
  service: TodoService,
  clients: Set<AliveWebSocket>,
): void {
  const { id, ...updates } = data;
  const todo = service.update(id, updates);
  const message: TodoUpdatedMessage = {
    type: "todo:updated",
    data: todo,
  };
  broadcast(clients, message);
}

function handleDelete(
  id: number,
  service: TodoService,
  clients: Set<AliveWebSocket>,
): void {
  service.delete(id);
  const message: TodoDeletedMessage = {
    type: "todo:deleted",
    data: { id },
  };
  broadcast(clients, message);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function broadcast(
  clients: Set<AliveWebSocket>,
  message: ServerMessage,
): void {
  const serialized = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function sendError(
  ws: AliveWebSocket,
  message: string,
  originalType?: string,
): void {
  const errorMessage: ErrorMessage = {
    type: "error",
    data: {
      message,
      ...(originalType !== undefined && { originalType }),
    },
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errorMessage));
  }
}
