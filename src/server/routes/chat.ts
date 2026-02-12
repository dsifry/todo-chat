import { Router, Request, Response } from "express";
import { ChatService, ValidationError } from "../services/chat.js";
import { sanitizeErrorMessage } from "../index.js";

/**
 * Factory function that creates an Express Router for chat endpoints.
 * Uses dependency injection — receives a ChatService instance.
 *
 * Intended to be mounted at `/api/chat`.
 */
export function createChatRouter(service: ChatService): Router {
  const router = Router();

  // GET / — chat history
  router.get("/", (_req: Request, res: Response) => {
    const messages = service.getHistory();
    res.json(messages);
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
        const chunk = iterResult.value;
        res.write(
          `data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`,
        );
        iterResult = await gen.next();
      }
      // iterResult.value is the final result
      const { suggestions } = iterResult.value;
      if (suggestions.length > 0) {
        res.write(
          `data: ${JSON.stringify({ type: "suggestions", items: suggestions })}\n\n`,
        );
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
