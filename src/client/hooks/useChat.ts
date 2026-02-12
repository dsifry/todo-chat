import { useState, useCallback, useEffect, useRef } from "react";
import type { ChatMessage, TodoSuggestion } from "../types/index.js";

interface SSEEvent {
  type: "chunk" | "suggestions" | "done" | "error";
  content?: string;
  items?: TodoSuggestion[];
  message?: string;
}

interface UseChatOptions {
  onSuggestionAccepted?: (title: string) => void;
}

let nextOptimisticId = -1;
function getNextOptimisticId(): number {
  return nextOptimisticId--;
}

export function useChat(options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TodoSuggestion[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const onSuggestionAcceptedRef = useRef(options.onSuggestionAccepted);
  onSuggestionAcceptedRef.current = options.onSuggestionAccepted;

  // Load chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch("/api/chat");
        if (!res.ok) throw new Error("Failed to load chat history");
        const data = (await res.json()) as ChatMessage[];
        setMessages(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    void loadHistory();
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      // Add user message optimistically
      const userMessage: ChatMessage = {
        id: getNextOptimisticId(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");
      setSuggestions([]);
      setError(null);

      try {
        const res = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to send message");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const event = JSON.parse(line.slice(6)) as SSEEvent;

            switch (event.type) {
              case "chunk":
                fullText += event.content || "";
                setStreamingContent(fullText);
                break;
              case "suggestions":
                setSuggestions(event.items || []);
                break;
              case "done": {
                // Add assistant message
                const assistantMessage: ChatMessage = {
                  id: getNextOptimisticId(),
                  role: "assistant",
                  content: fullText,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent("");
                break;
              }
              case "error":
                setError(event.message || "An error occurred");
                break;
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send message",
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming],
  );

  const acceptSuggestion = useCallback(
    (suggestion: TodoSuggestion) => {
      onSuggestionAcceptedRef.current?.(suggestion.title);
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === suggestion.id ? { ...s, accepted: true } : s,
        ),
      );
    },
    [],
  );

  const dismissSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    streamingContent,
    suggestions,
    sendMessage,
    acceptSuggestion,
    dismissSuggestions,
  };
}
