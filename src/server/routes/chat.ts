import { Router, Request, Response } from "express";
import { ChatService, ValidationError } from "../services/chat.js";
import type { ServerMessage } from "../../shared/types.js";
import { sanitizeErrorMessage } from "../index.js";

export type BroadcastFn = (message: ServerMessage) => void;

/**
 * Factory function that creates an Express Router for chat endpoints.
 * Uses dependency injection — receives a ChatService instance.
 *
 * Intended to be mounted at `/api/chat`.
 */
export function createChatRouter(
  service: ChatService,
  broadcast?: BroadcastFn,
): Router {
  const router = Router();

  // GET / — chat history
  router.get("/", (_req: Request, res: Response) => {
    const messages = service.getHistory();
    res.json(messages);
  });

  // DELETE / — clear chat history
  router.delete("/", (_req: Request, res: Response) => {
    service.clearHistory();
    res.status(204).end();
  });

  // POST /message — send message, stream response via SSE
  router.post("/message", async (req: Request, res: Response) => {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      const gen = service.sendMessage(req.body.content);
      let iterResult = await gen.next();
      while (!iterResult.done) {
        const event = iterResult.value;
        if (event.type === "chunk") {
          res.write(
            `data: ${JSON.stringify({ type: "chunk", content: event.content })}\n\n`,
          );
        } else if (event.type === "tool_result") {
          res.write(
            `data: ${JSON.stringify({ type: "todo_operation", toolName: event.toolName, result: event.result })}\n\n`,
          );

          // Broadcast WebSocket messages for todo mutations
          if (broadcast) {
            broadcastTodoChanges(broadcast, event.toolName, event.result);
          }
        }
        iterResult = await gen.next();
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`,
        );
        res.end();
        return;
      }
      // Generic error — sanitize message
      const message = sanitizeErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
      res.write(
        `data: ${JSON.stringify({ type: "error", message })}\n\n`,
      );
      res.end();
    }
  });

  return router;
}

/**
 * Broadcast WebSocket messages for todo changes triggered by AI tool use.
 */
function broadcastTodoChanges(
  broadcast: BroadcastFn,
  toolName: string,
  result: unknown,
): void {
  if (toolName === "add_todos" && Array.isArray(result)) {
    for (const todo of result) {
      broadcast({ type: "todo:created", data: todo, tempId: "" });
    }
  } else if (toolName === "update_todos" && Array.isArray(result)) {
    for (const todo of result) {
      broadcast({ type: "todo:updated", data: todo });
    }
  } else if (toolName === "delete_todos") {
    const deleteResult = result as { deleted?: number[] } | null;
    if (deleteResult?.deleted) {
      for (const id of deleteResult.deleted) {
        broadcast({ type: "todo:deleted", data: { id } });
      }
    }
  }
}
