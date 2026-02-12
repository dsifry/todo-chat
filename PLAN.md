# Implementation Plan: Real-time Collaborative Todo List with AI Chat

**Issue:** #1
**Status:** Approved (Design Review Gate passed — Iteration 2)

---

## Architecture Overview

### Monorepo Structure
Single repo with shared types between client and server. Vite handles frontend bundling with proxy to backend API during development.

### Data Flow
```
Client (React) ←→ WebSocket ←→ Server (Express) ←→ SQLite (better-sqlite3)
                                    ↕
                              Anthropic SDK (Claude)
```

### Key Architectural Decisions
1. **Shared types** in `src/shared/types.ts` — single source of truth for all data shapes. `src/client/types/index.ts` re-exports shared types and adds client-only types (component props, UI state)
2. **WebSocket protocol** — JSON messages with `type` discriminator for TypeScript narrowing. All incoming WS messages validated with Zod schemas
3. **Optimistic UI** — `tempId` mechanism for client-side optimistic updates with server reconciliation. Concurrent edits use last-write-wins (server is source of truth)
4. **Chat streaming** — Server-Sent Events (SSE) for chat streaming (unidirectional), WebSocket for todo sync (bidirectional)
5. **Claude context** — Current todo list injected into system prompt with each message
6. **Todo suggestions** — Claude uses `[SUGGEST_TODO: "title"]` markers; server parses post-stream and returns to client for user confirmation
7. **In-memory SQLite for tests** — Real behavior without mocking the database layer
8. **Service layer** — `TodoService` and `ChatService` encapsulate business logic; routes and WS handler are thin adapters that delegate to services
9. **Rate limiting** — `express-rate-limit` on chat endpoint (10 req/min per IP) to prevent API quota exhaustion
10. **Security** — Server binds to `127.0.0.1` by default (local demo); body size limits; no `dangerouslySetInnerHTML`; error messages never expose internals or API keys

### WebSocket Protocol
```typescript
// Client → Server (all validated with Zod before processing)
{ type: "todo:create", tempId: string, data: { title: string } }
{ type: "todo:update", data: { id: number, title?: string, completed?: boolean } }
{ type: "todo:delete", data: { id: number } }

// Server → All Clients
{ type: "todo:created", tempId?: string, data: Todo }
{ type: "todo:updated", data: Todo }
{ type: "todo:deleted", data: { id: number } }
{ type: "todo:sync", data: Todo[] }  // Full state on reconnect

// Server → Sender Only (error)
{ type: "error", data: { message: string, originalType?: string } }
```

### REST API Endpoints
```
GET    /api/todos          → 200: Todo[]
POST   /api/todos          → 201: Todo
PATCH  /api/todos/:id      → 200: Todo | 404: ApiError
DELETE /api/todos/:id      → 204 (no body) | 404: ApiError
GET    /api/chat/history   → 200: ChatMessage[] (no pagination — returns all)
POST   /api/chat/message   → SSE stream  Body: { content: string } (max 4000 chars)
GET    /api/health         → 200: { status: "ok" }
```

### ApiError Format
```typescript
{ error: { code: string, message: string } }
```
Error handler never exposes stack traces, file paths, or internal details. Anthropic SDK errors are sanitized before returning to client.

### Database Schema
```sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE todo_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_message_id INTEGER NOT NULL REFERENCES chat_messages(id),
  title TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Work Unit Dependency Graph

```
WU-01 (Project Setup)
    │
    ▼
WU-02 (Shared Types) ─────────────────────────────────────────┐
    │                                                           │
    ├──────────────────────┐                                    │
    ▼                      ▼                                    │
WU-03 (DB Schema)      WU-04 (Server Skeleton)   WU-08 (Client Skeleton)
    │                      │                           │
    ▼                      │                           │
  ★ CHECKPOINT 1: Database Schema Review               │
    │                      │                           │
    ▼                      │                           ▼
WU-05 (DB Queries)         │                      WU-09 (Todo Components)
    │                      │                           │
    ├──────────────────────┤                           │
    ▼                      ▼                           │
WU-05a (TodoService) ──→ WU-06 (Todo REST API)        │
    │                                                  │
    ▼                                                  │
WU-07 (WebSocket Handler)                              │
    │                                                  │
    ▼                                                  ▼
  ★ CHECKPOINT 2: API & WebSocket Protocol Review  WU-10 (WebSocket Hook)
    │                                                  │
    ▼                                                  │
WU-11 (Claude Service)                                 │
    │                                                  │
    ▼                                                  │
  ★ CHECKPOINT 3: AI Integration Review                │
    │                                                  │
    ▼                                                  │
WU-12a (Chat API Routes) ─────────────────────────────┤
    │                                                  │
    ▼                                                  ▼
WU-12b (Chat UI Components) ◀────────────────── WU-10, WU-09
    │
    ▼
WU-13 (Polish & UX)
    │
    ▼
WU-14 (CI/CD & Docs)
```

**Parallelism opportunity:** WU-03/WU-04 (server) and WU-08/WU-09 (client) can run in parallel after WU-02 completes.

---

## Work Units

### WU-01: Project Setup & Tooling

**Spec:** Initialize all project dependencies, TypeScript configs, build tooling, linting, and test infrastructure.

**File Scope:**
- `package.json`
- `tsconfig.json`, `tsconfig.server.json`, `tsconfig.client.json`
- `vite.config.ts`
- `tailwind.config.ts`, `postcss.config.js`
- `.eslintrc.cjs`, `.prettierrc`
- `vitest.config.ts`
- `.env.example`
- `.gitignore` (update)
- `src/client/index.css` (Tailwind directives)
- `index.html`

**DoD:**
- [ ] `npm install` succeeds with all dependencies: react, react-dom, express, better-sqlite3, ws, @anthropic-ai/sdk, tailwindcss, zod, express-rate-limit, supertest, @testing-library/react, @testing-library/jest-dom, jsdom, vitest, @vitejs/plugin-react, typescript, eslint, prettier, and their type packages
- [ ] `npx tsc --noEmit` succeeds (both server and client configs)
- [ ] `npx vitest run` succeeds (with placeholder test)
- [ ] `npx eslint .` succeeds
- [ ] `npx prettier --check .` succeeds
- [ ] Vite dev server starts and serves a placeholder page
- [ ] Vite config has proxy from `/api` to backend server
- [ ] `.env.example` contains `ANTHROPIC_API_KEY`, `PORT`, `DATABASE_PATH`
- [ ] `.gitignore` includes `*.db`, `node_modules`, `dist`, `.env`
- [ ] `.coverage-thresholds.json` updated: thresholds set to 90%, command set to `npm run test:coverage`

**Dependencies:** None
**Human Checkpoint:** No

---

### WU-02: Shared Types

**Spec:** Define all shared TypeScript types used by both client and server, including Zod validation schemas for WebSocket messages.

**File Scope:**
- `src/shared/types.ts`
- `src/shared/validation.ts`
- `src/shared/types.test.ts`

**DoD:**
- [ ] `Todo` type defined with `id`, `title`, `completed`, `createdAt`, `updatedAt`
- [ ] `ChatMessage` type defined with `id`, `role` (union: 'user' | 'assistant'), `content`, `createdAt`
- [ ] `TodoSuggestion` type defined with `id`, `chatMessageId`, `title`, `accepted`
- [ ] `WebSocketMessage` discriminated union type for all WS message types (including `error` type)
- [ ] `ApiError` type defined: `{ error: { code: string, message: string } }`
- [ ] `CreateTodoInput` and `UpdateTodoInput` Zod schemas defined (title: non-empty, max 500 chars)
- [ ] `ChatMessageInput` Zod schema defined (content: non-empty, max 4000 chars)
- [ ] `WebSocketMessageSchema` Zod discriminated union for validating all incoming WS messages
- [ ] All types use strict TypeScript (no `any`)
- [ ] Type tests verify type narrowing works for WebSocket messages
- [ ] Tests verify Zod schemas reject invalid inputs

**Dependencies:** WU-01
**Human Checkpoint:** No

---

### WU-03: Database Schema & Migrations

**Spec:** Create SQLite schema with better-sqlite3, including tables for todos, chat_messages, and todo_suggestions.

**File Scope:**
- `src/server/db/schema.ts`
- `src/server/db/schema.test.ts`

**DoD:**
- [ ] `initializeDatabase(dbPath: string)` function creates/opens database
- [ ] `todos` table created with columns: `id`, `title`, `completed`, `created_at`, `updated_at`
- [ ] `chat_messages` table created with columns: `id`, `role`, `content`, `created_at`
- [ ] `todo_suggestions` table created with columns: `id`, `chat_message_id`, `title`, `accepted`, `created_at`
- [ ] CHECK constraint on `chat_messages.role` for 'user' | 'assistant'
- [ ] Foreign key constraint on `todo_suggestions.chat_message_id`
- [ ] WAL mode enabled for concurrent read/write
- [ ] Foreign keys enforcement enabled (`PRAGMA foreign_keys = ON`)
- [ ] Tests verify schema creation with in-memory SQLite (`:memory:`)
- [ ] Tests verify idempotent re-initialization (CREATE TABLE IF NOT EXISTS)
- [ ] Tests verify foreign key constraints are enforced

**Dependencies:** WU-01, WU-02
**Human Checkpoint:** **YES** — Review database schema before proceeding

---

### WU-04: Express Server Skeleton

**Spec:** Create the Express server entry point with middleware, error handling, rate limiting, and static file serving configuration.

**File Scope:**
- `src/server/index.ts`
- `src/server/middleware/validation.ts`
- `src/server/index.test.ts`

**DoD:**
- [ ] Express app created with `express.json({ limit: '100kb' })` body size limit
- [ ] CORS configured: `origin: process.env.CORS_ORIGIN || 'http://localhost:5173'` (restrictive, not `*`)
- [ ] Request validation middleware using Zod schemas from `src/shared/validation.ts`
- [ ] Global error handler returns `ApiError` format; never exposes stack traces, file paths, or internal error details
- [ ] Anthropic SDK errors sanitized (API key pattern never exposed)
- [ ] Rate limiting middleware on `/api/chat` routes: 10 requests/minute per IP
- [ ] Server exports `createApp(db)` factory for testing (dependency injection)
- [ ] Health check endpoint at `GET /api/health` returns `{ status: "ok" }`
- [ ] Static file serving configured for production builds
- [ ] Server binds to `127.0.0.1` by default (configurable via `HOST` env var)
- [ ] Tests verify health check endpoint returns 200
- [ ] Tests verify error handler formats errors correctly and suppresses internals
- [ ] Tests verify validation middleware rejects invalid input
- [ ] Tests verify body size limit rejects oversized requests

**Dependencies:** WU-01, WU-02
**Human Checkpoint:** No

---

### WU-05: Database Query Layer

**Spec:** Create prepared statement wrappers for all database operations.

**File Scope:**
- `src/server/db/queries.ts`
- `src/server/db/queries.test.ts`

**DoD:**
- [ ] `getAllTodos()` returns all todos ordered by `created_at DESC`
- [ ] `getTodoById(id)` returns single todo or undefined
- [ ] `createTodo(title)` creates and returns new todo
- [ ] `updateTodo(id, updates)` updates and returns modified todo
- [ ] `deleteTodo(id)` deletes todo, returns boolean success
- [ ] `getChatHistory()` returns all messages ordered by `created_at ASC`
- [ ] `createChatMessage(role, content)` creates and returns new message
- [ ] `createTodoSuggestion(chatMessageId, title)` creates suggestion
- [ ] `acceptTodoSuggestion(id)` marks suggestion as accepted
- [ ] All queries use prepared statements (parameterized — no string concatenation)
- [ ] `updated_at` is automatically set on todo updates
- [ ] Database instance injected via constructor/factory (dependency injection)
- [ ] Tests use in-memory SQLite with real schema
- [ ] Tests verify CRUD operations for todos
- [ ] Tests verify chat message operations
- [ ] Tests verify todo suggestion operations
- [ ] Tests verify error cases (update/delete non-existent)

**Dependencies:** WU-03
**Human Checkpoint:** No

---

### WU-05a: Todo Service Layer

**Spec:** Create a service layer that encapsulates todo business logic, consumed by both REST routes and WebSocket handler.

**File Scope:**
- `src/server/services/todo.ts`
- `src/server/services/todo.test.ts`

**DoD:**
- [ ] `TodoService` class with DB queries injected via constructor
- [ ] `getAll()` returns all todos
- [ ] `getById(id)` returns todo or throws NotFoundError
- [ ] `create(title)` validates input and creates todo
- [ ] `update(id, updates)` validates input, updates, and returns todo or throws NotFoundError
- [ ] `delete(id)` deletes todo or throws NotFoundError
- [ ] Input validation uses Zod schemas from shared validation
- [ ] Typed errors (NotFoundError, ValidationError) for different failure modes
- [ ] Tests verify all operations via injected in-memory DB
- [ ] Tests verify error cases throw typed errors

**Dependencies:** WU-05
**Human Checkpoint:** No

---

### WU-06: Todo REST API Routes

**Spec:** Implement RESTful CRUD endpoints for todos, delegating to TodoService.

**File Scope:**
- `src/server/routes/todos.ts`
- `src/server/routes/todos.test.ts`

**DoD:**
- [ ] `GET /api/todos` returns 200 with todos as JSON array
- [ ] `POST /api/todos` returns 201 with created todo
- [ ] `PATCH /api/todos/:id` returns 200 with updated todo
- [ ] `DELETE /api/todos/:id` returns 204 (no body)
- [ ] Routes delegate to `TodoService` (no direct DB access in routes)
- [ ] 404 response for update/delete of non-existent todo
- [ ] 400 response for validation failures with descriptive error messages
- [ ] Tests verify all CRUD operations via HTTP using Supertest
- [ ] Tests verify validation error responses
- [ ] Tests verify 404 for missing todos
- [ ] Tests verify correct HTTP status codes (201, 204, 400, 404)

**Dependencies:** WU-04, WU-05a
**Human Checkpoint:** No

---

### WU-07: WebSocket Handler

**Spec:** Implement WebSocket connection management and real-time todo sync broadcasting, delegating to TodoService. All incoming messages validated with Zod.

**File Scope:**
- `src/server/websocket/handler.ts`
- `src/server/websocket/handler.test.ts`

**DoD:**
- [ ] WebSocket server attaches to HTTP server
- [ ] WebSocket origin validation via `verifyClient` callback (allowed origins configurable)
- [ ] New connections receive `todo:sync` with full todo list
- [ ] All incoming messages validated against `WebSocketMessageSchema` (Zod) before processing
- [ ] `todo:create` messages delegate to TodoService and broadcast `todo:created` to all clients
- [ ] `todo:update` messages delegate to TodoService and broadcast `todo:updated` to all clients
- [ ] `todo:delete` messages delegate to TodoService and broadcast `todo:deleted` to all clients
- [ ] `tempId` from create messages included in broadcast for optimistic UI reconciliation
- [ ] Invalid messages receive `{ type: "error", data: { message, originalType } }` (not broadcast)
- [ ] Zod validation failures receive error response with descriptive message
- [ ] Client disconnect is handled cleanly (removed from connection set)
- [ ] JSON parse errors handled gracefully with error response
- [ ] Server sends WebSocket ping every 30 seconds; client timeout after 45 seconds
- [ ] Tests use real WebSocket connections (ws library)
- [ ] Tests verify sync on connect
- [ ] Tests verify broadcast to multiple clients
- [ ] Tests verify tempId passthrough
- [ ] Tests verify Zod validation rejects malformed messages
- [ ] Tests verify error response format for invalid messages

**Dependencies:** WU-05a, WU-06
**Human Checkpoint:** **YES** — Review API design and WebSocket protocol before proceeding

---

### WU-08: Client Skeleton & Layout

**Spec:** Set up React app entry point, main layout, and component structure.

**File Scope:**
- `src/client/main.tsx`
- `src/client/App.tsx`
- `src/client/App.test.tsx`
- `src/client/types/index.ts`

**DoD:**
- [ ] React 18 app renders with `createRoot`
- [ ] Main layout with two-panel design (todo list left, chat right)
- [ ] Responsive: stacks vertically on mobile (< 640px), side-by-side on desktop
- [ ] Tailwind CSS styles applied
- [ ] App component renders placeholder sections for TodoList and ChatPanel
- [ ] `src/client/types/index.ts` re-exports from `src/shared/types.ts` and adds client-only types (component props, UI state types like ConnectionStatus)
- [ ] Tests verify App renders both panels
- [ ] Tests verify responsive layout classes

**Dependencies:** WU-01, WU-02
**Human Checkpoint:** No

---

### WU-09: Todo Components

**Spec:** Implement TodoList, TodoItem, and AddTodo components with full CRUD UI.

**File Scope:**
- `src/client/components/TodoList.tsx`
- `src/client/components/TodoItem.tsx`
- `src/client/components/AddTodo.tsx`
- `src/client/hooks/useTodos.ts`
- `src/client/components/TodoList.test.tsx`

**DoD:**
- [ ] `AddTodo` component with input field, Enter to submit, Escape to clear
- [ ] `TodoItem` displays title, completion checkbox, edit button, delete button
- [ ] `TodoItem` supports inline editing with Enter to save, Escape to cancel
- [ ] `TodoList` renders list of TodoItems with loading state
- [ ] `useTodos` hook manages todo state with fetch from REST API
- [ ] Empty state displayed when no todos exist
- [ ] Input validation: prevents empty todo submission
- [ ] All content rendered with React's default text escaping (no `dangerouslySetInnerHTML`)
- [ ] Tests verify AddTodo submission and keyboard shortcuts
- [ ] Tests verify TodoItem toggle, edit, delete actions
- [ ] Tests verify TodoList renders todos and loading state
- [ ] Tests verify empty state rendering

**Dependencies:** WU-08
**Human Checkpoint:** No

---

### WU-10: WebSocket Hook & Real-time Sync

**Spec:** Implement useWebSocket hook for real-time synchronization with optimistic UI updates.

**File Scope:**
- `src/client/hooks/useWebSocket.ts`
- `src/client/hooks/useTodos.ts` (update to integrate WebSocket)
- `src/client/hooks/hooks.test.ts`

**DoD:**
- [ ] `useWebSocket` hook manages WebSocket connection lifecycle
- [ ] Auto-connect on mount, disconnect on unmount
- [ ] Reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] Connection status exposed: 'connecting' | 'connected' | 'disconnected'
- [ ] `useTodos` updated to use WebSocket for mutations (create, update, delete)
- [ ] Optimistic updates: UI updates immediately, reconciles with server response via `tempId`
- [ ] Server-initiated updates merge into local state
- [ ] Full sync on reconnect replaces local state
- [ ] Tests verify connection lifecycle (using mock WebSocket)
- [ ] Tests verify reconnection backoff logic
- [ ] Tests verify optimistic update and reconciliation
- [ ] Tests verify server-initiated updates

**Dependencies:** WU-09
**Human Checkpoint:** No

---

### WU-11: Claude Service (Server-side)

**Spec:** Implement Anthropic SDK wrapper with streaming, todo context injection, and suggestion parsing.

**File Scope:**
- `src/server/services/claude.ts`
- `src/server/services/claude.test.ts`

**DoD:**
- [ ] `ClaudeService` class wraps `@anthropic-ai/sdk` (SDK client injected via constructor)
- [ ] `streamChat(messages, todos)` sends message to Claude with todo context
- [ ] System prompt includes current todo list formatted as readable text
- [ ] System prompt instructs Claude to use `[SUGGEST_TODO: "title"]` for suggestions
- [ ] Streaming response yields text chunks as they arrive
- [ ] Post-stream parsing extracts `[SUGGEST_TODO: "title"]` markers (handles escaped quotes)
- [ ] Returns both response text (with markers stripped) and extracted suggestions
- [ ] Handles API errors gracefully (rate limits, auth failures, network)
- [ ] Error messages sanitized: never expose ANTHROPIC_API_KEY pattern or internal SDK details
- [ ] `ANTHROPIC_API_KEY` loaded from environment variable
- [ ] Tests mock Anthropic SDK (do NOT make real API calls)
- [ ] Tests verify system prompt includes todo context
- [ ] Tests verify suggestion extraction from response text (including edge cases: escaped quotes, multiple suggestions, no suggestions)
- [ ] Tests verify error handling for API failures
- [ ] Tests verify streaming chunk delivery
- [ ] Tests verify API key is never exposed in error messages

**Dependencies:** WU-05
**Human Checkpoint:** **YES** — Review AI integration design before proceeding

---

### WU-12a: Chat API Routes (Server-side)

**Spec:** Implement chat REST endpoints with SSE streaming, using a ChatService to orchestrate the flow.

**File Scope:**
- `src/server/services/chat.ts`
- `src/server/routes/chat.ts`
- `src/server/routes/chat.test.ts`

**DoD:**
- [ ] `ChatService` class orchestrates: persist user message → fetch todos for context → call ClaudeService → persist assistant message → persist suggestions
- [ ] `GET /api/chat/history` returns 200 with chat message history (no pagination — returns all)
- [ ] `POST /api/chat/message` accepts `{ content: string }` (validated with Zod, max 4000 chars), streams Claude response via SSE
- [ ] Rate limited: 10 requests/minute per IP
- [ ] SSE stream sends `data: { type: "chunk", content: "..." }` events
- [ ] SSE stream sends `data: { type: "suggestions", items: [...] }` at end
- [ ] SSE stream sends `data: { type: "done" }` final event
- [ ] SSE stream sends `data: { type: "error", message: "..." }` on failure (sanitized, no internals)
- [ ] Chat messages persisted to SQLite (both user and assistant)
- [ ] Todo suggestions persisted with reference to chat message
- [ ] Route delegates to ChatService (no business logic in route handler)
- [ ] Tests verify chat history endpoint
- [ ] Tests verify SSE streaming format (collect chunks, verify order)
- [ ] Tests verify input validation (empty, too long)
- [ ] Tests verify error handling for Claude failures (returns SSE error event)

**Dependencies:** WU-11, WU-05a
**Human Checkpoint:** No

---

### WU-12b: Chat UI Components (Client-side)

**Spec:** Implement React chat UI components and the useChat hook.

**File Scope:**
- `src/client/components/ChatPanel.tsx`
- `src/client/components/ChatMessage.tsx`
- `src/client/hooks/useChat.ts`
- `src/client/components/ChatPanel.test.tsx`

**DoD:**
- [ ] `ChatPanel` displays message history with auto-scroll to bottom
- [ ] `ChatMessage` component renders user and assistant messages differently (styling, alignment)
- [ ] All chat content rendered with React's default text escaping (no `dangerouslySetInnerHTML`)
- [ ] `useChat` hook manages chat state, message sending, streaming display
- [ ] Streaming response displays incrementally in UI
- [ ] Client handles SSE stream interruption gracefully (displays partial response with error indicator)
- [ ] Todo suggestions displayed as actionable buttons ("Add this todo?")
- [ ] Accepting a suggestion creates a todo via the existing todo system (calls useTodos)
- [ ] Input field with Enter to send, Shift+Enter for newline
- [ ] Loading state while Claude is responding
- [ ] Tests verify ChatPanel renders messages
- [ ] Tests verify streaming display (incremental text)
- [ ] Tests verify suggestion acceptance flow
- [ ] Tests verify loading states
- [ ] Tests verify SSE error handling displays error indicator

**Dependencies:** WU-12a, WU-09, WU-10
**Human Checkpoint:** No

---

### WU-13: Polish & UX

**Spec:** Add toast notifications, keyboard shortcuts, error boundaries, and responsive refinements.

**File Scope:**
- `src/client/components/Toast.tsx`
- `src/client/components/ErrorBoundary.tsx`
- `src/client/App.tsx` (update)
- `src/client/index.css` (update)
- `src/client/components/Toast.test.tsx`

**DoD:**
- [ ] Toast notification system for sync events (connected, disconnected, error)
- [ ] Toast auto-dismisses after 3 seconds
- [ ] Error boundary catches React rendering errors with fallback UI
- [ ] Responsive layout works on mobile (< 640px) and desktop
- [ ] Loading skeleton states for initial data fetch
- [ ] Keyboard shortcut hints displayed in UI
- [ ] All interactive elements have proper focus styles
- [ ] Tests verify toast rendering and auto-dismiss
- [ ] Tests verify error boundary catches errors

**Dependencies:** WU-12b
**Human Checkpoint:** No

---

### WU-14: CI/CD Pipeline & Documentation

**Spec:** Configure GitHub Actions CI, finalize coverage thresholds, and create README.

**File Scope:**
- `.github/workflows/ci.yml` (update)
- `.coverage-thresholds.json` (verify — already updated in WU-01)
- `CLAUDE.md` (update coverage to 90%)
- `README.md`
- `.env.example` (verify)
- `package.json` (verify scripts)

**DoD:**
- [ ] CI pipeline runs: install, lint, typecheck, test with coverage
- [ ] `.coverage-thresholds.json` thresholds are 90% and command is `npm run test:coverage`
- [ ] `CLAUDE.md` updated to say "90%+ test coverage required" (matching issue #1)
- [ ] CI uses `npm ci` and `npm run` (not pnpm)
- [ ] README has setup instructions (clone, install, env setup, dev server)
- [ ] README documents available npm scripts
- [ ] README documents environment variables
- [ ] README documents WebSocket protocol
- [ ] All npm scripts work: `dev`, `build`, `test`, `test:coverage`, `lint`, `typecheck`
- [ ] `npm run build` produces working production bundle
- [ ] Tests verify build output exists

**Dependencies:** WU-13
**Human Checkpoint:** No

---

## Human Checkpoints

### Checkpoint 1: After WU-03 (Database Schema)
**Trigger:** WU-03 passes adversarial review
**Review scope:** Database schema design, table relationships, constraints, migration strategy
**Questions:**
- Is the schema normalized appropriately for this use case?
- Are the constraints sufficient?
- Should we add any indexes for query performance?

### Checkpoint 2: After WU-07 (API & WebSocket Protocol)
**Trigger:** WU-07 passes adversarial review
**Review scope:** REST endpoints, WebSocket protocol, TodoService design, error handling
**Questions:**
- Are the REST endpoint designs correct (methods, status codes, response shapes)?
- Is the WebSocket protocol complete and sound?
- Is the Zod validation for WS messages appropriate?

### Checkpoint 3: After WU-11 (Claude Service / AI Integration)
**Trigger:** WU-11 passes adversarial review
**Review scope:** Claude SDK integration, system prompt design, suggestion parsing, error handling
**Questions:**
- Is the system prompt effective for todo context?
- Is the suggestion marker format robust enough?
- Are API error scenarios handled appropriately?

---

## Testing Strategy

| Layer | Tool | Approach |
|-------|------|----------|
| Database | Vitest | In-memory SQLite (`:memory:`) — real behavior, no mocks |
| Services | Vitest | Injected deps — real DB for TodoService, mocked SDK for ClaudeService |
| API Routes | Vitest + Supertest | HTTP integration tests against `createApp(db)` factory |
| WebSocket | Vitest + ws | Real WebSocket connections for integration tests |
| React Components | Vitest + RTL | Component rendering, user interaction simulation |
| Hooks | Vitest + RTL `renderHook` | Hook lifecycle, state management (mock WebSocket for client hooks) |

**Test file convention:** Co-located with source (e.g., `src/server/db/schema.test.ts`). Exception: client component tests in `src/client/components/*.test.tsx`.

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| WebSocket reconnection complexity | Exponential backoff with max cap; full state sync on reconnect; ping/pong heartbeat |
| Optimistic UI conflicts | tempId reconciliation; server is source of truth; last-write-wins for concurrent edits |
| Claude API rate limits | express-rate-limit (10/min per IP); graceful error handling; user-facing error messages |
| Claude API cost exhaustion | Rate limiting; chat message max length (4000 chars) |
| SSE stream interruption | Client displays partial response with error indicator |
| XSS via user/AI content | React default text escaping; no `dangerouslySetInnerHTML`; no markdown rendering |
| WebSocket message injection | Zod schema validation on all incoming WS messages; origin validation |
| API key exposure | Never in responses/logs; error sanitization; server-side only |
| Test flakiness with WebSocket | Real connections with proper cleanup in afterEach; mock WS for client hooks |
| SQLite concurrent access | WAL mode enabled; synchronous prepared statements |
| Coverage threshold conflict | Issue says 90%; WU-01 updates `.coverage-thresholds.json` to 90%; WU-14 updates CLAUDE.md to match |
