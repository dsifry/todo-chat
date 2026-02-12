import { useCallback } from "react";
import { TodoList } from "./components/TodoList.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { useTodos } from "./hooks/useTodos.js";
import { useChat } from "./hooks/useChat.js";

export function App() {
  const {
    todos,
    isLoading,
    error,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    connectionStatus,
  } = useTodos({ enableWebSocket: true });

  const handleSuggestionAccepted = useCallback(
    (title: string) => {
      void addTodo(title);
    },
    [addTodo],
  );

  const {
    messages,
    isStreaming,
    error: chatError,
    streamingContent,
    suggestions,
    sendMessage,
    acceptSuggestion,
    dismissSuggestions,
  } = useChat({ onSuggestionAccepted: handleSuggestionAccepted });

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Todo Chat</h1>
        <span
          className={`text-xs ${connectionStatus === "connected" ? "text-green-600" : "text-gray-400"}`}
        >
          {connectionStatus === "connected" ? "Live" : "Offline"}
        </span>
      </header>

      {/* Main content - two panels */}
      <main className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* Todo panel */}
        <section
          className="flex flex-1 flex-col border-b border-gray-200 sm:border-b-0 sm:border-r"
          aria-label="Todo List"
        >
          <div className="border-b border-gray-200 bg-white px-4 py-2">
            <h2 className="text-lg font-semibold text-gray-700">Todos</h2>
          </div>
          {error && (
            <div className="bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          <TodoList
            todos={todos}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onUpdate={updateTodo}
            onDelete={deleteTodo}
            isLoading={isLoading}
          />
        </section>

        {/* Chat panel */}
        <section className="flex flex-1 flex-col" aria-label="Chat">
          <div className="border-b border-gray-200 bg-white px-4 py-2">
            <h2 className="text-lg font-semibold text-gray-700">Chat</h2>
          </div>
          <ChatPanel
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            error={chatError}
            suggestions={suggestions}
            onSend={sendMessage}
            onAcceptSuggestion={acceptSuggestion}
            onDismissSuggestions={dismissSuggestions}
          />
        </section>
      </main>
    </div>
  );
}
