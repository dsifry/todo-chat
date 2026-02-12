export function App() {
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Todo Chat</h1>
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
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-gray-500">Todo list will appear here</p>
          </div>
        </section>

        {/* Chat panel */}
        <section className="flex flex-1 flex-col" aria-label="Chat">
          <div className="border-b border-gray-200 bg-white px-4 py-2">
            <h2 className="text-lg font-semibold text-gray-700">Chat</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-gray-500">Chat will appear here</p>
          </div>
        </section>
      </main>
    </div>
  );
}
