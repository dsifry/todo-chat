# Todo Chat

A real-time collaborative todo list with AI chat powered by Claude. Manage todos via a WebSocket-driven UI and ask an AI assistant for help organizing your tasks.

## Prerequisites

- Node.js 20+
- npm 9+
- An [Anthropic API key](https://console.anthropic.com/) (required for AI chat)

## Setup

```bash
# Clone the repository
git clone https://github.com/dsifry/todo-chat.git
cd todo-chat

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start the development server (client)
npm run dev

# In a second terminal, start the backend server
npm run dev:server
```

The Vite dev server runs on `http://localhost:5173` and proxies API/WebSocket requests to the backend on port 3001.

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start Vite dev server (client) |
| `dev:server` | `npm run dev:server` | Start backend server with hot reload |
| `build` | `npm run build` | TypeScript compile + Vite production build |
| `preview` | `npm run preview` | Preview production build |
| `test` | `npm test` | Run tests once |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `test:coverage` | `npm run test:coverage` | Run tests with coverage report |
| `lint` | `npm run lint` | Lint with ESLint |
| `typecheck` | `npm run typecheck` | Type-check client and server code |
| `format` | `npm run format` | Format code with Prettier |
| `format:check` | `npm run format:check` | Check formatting |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | -- | Anthropic API key for AI chat |
| `PORT` | No | `3001` | Backend server port |
| `HOST` | No | `127.0.0.1` | Backend server host |
| `DATABASE_PATH` | No | `./data/todos.db` | SQLite database file path |

## WebSocket Protocol

The app uses WebSocket connections at `ws://localhost:3001/ws` for real-time todo synchronization. Messages are JSON with a discriminated union on the `type` field.

### Client to Server

| Type | Payload | Description |
|---|---|---|
| `todo:create` | `{ tempId: string, data: { title: string } }` | Create a new todo |
| `todo:update` | `{ data: { id: number, title?: string, completed?: boolean } }` | Update an existing todo |
| `todo:delete` | `{ data: { id: number } }` | Delete a todo |

### Server to Client

| Type | Payload | Description |
|---|---|---|
| `todo:sync` | `{ data: Todo[] }` | Full todo list (sent on connect) |
| `todo:created` | `{ tempId?: string, data: Todo }` | A todo was created |
| `todo:updated` | `{ data: Todo }` | A todo was updated |
| `todo:deleted` | `{ data: { id: number } }` | A todo was deleted |
| `error` | `{ data: { message: string, originalType?: string } }` | An error occurred |

### Chat API

Chat uses Server-Sent Events (SSE) via `POST /api/chat/message` with `{ content: string }` in the request body. The server streams `data:` events with types `chunk`, `suggestions`, `done`, or `error`. Chat history is available via `GET /api/chat`.

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, TypeScript
- **Backend:** Express, WebSocket (ws), better-sqlite3, TypeScript
- **AI:** Anthropic Claude SDK (streaming)
- **Testing:** Vitest, Testing Library, Supertest
- **Quality:** ESLint, Prettier, Husky
