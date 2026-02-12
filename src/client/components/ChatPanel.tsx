import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import type {
  ChatMessage as ChatMessageType,
  TodoSuggestion,
} from "../types/index.js";
import { ChatMessage } from "./ChatMessage.js";

interface ChatPanelProps {
  messages: ChatMessageType[];
  streamingContent: string;
  isStreaming: boolean;
  error: string | null;
  suggestions: TodoSuggestion[];
  onSend: (content: string) => void;
  onAcceptSuggestion: (suggestion: TodoSuggestion) => void;
  onDismissSuggestions: () => void;
}

export function ChatPanel({
  messages,
  streamingContent,
  isStreaming,
  error,
  suggestions,
  onSend,
  onAcceptSuggestion,
  onDismissSuggestions,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming && (
          <p className="text-center text-gray-400">
            Start a conversation to get help with your todos
          </p>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {/* Streaming indicator */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[80%] rounded-lg bg-gray-100 px-4 py-2 text-gray-900">
              <p className="whitespace-pre-wrap break-words">
                {streamingContent}
              </p>
            </div>
          </div>
        )}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="rounded-lg bg-gray-100 px-4 py-2 text-gray-400">
              Thinking...
            </div>
          </div>
        )}
        {/* Error indicator */}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="mb-2 text-sm font-medium text-blue-800">
              Suggested todos:
            </p>
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="mb-1 flex items-center gap-2"
              >
                <button
                  onClick={() => onAcceptSuggestion(suggestion)}
                  disabled={suggestion.accepted}
                  className={`rounded px-3 py-1 text-sm ${
                    suggestion.accepted
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {suggestion.accepted ? "Added!" : "Add this todo"}
                </button>
                <span className="text-sm text-gray-700">
                  {suggestion.title}
                </span>
              </div>
            ))}
            <button
              onClick={onDismissSuggestions}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your todos..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
