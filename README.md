# Todo Chat

A real-time todo list with an AI chat assistant powered by Claude. Add, complete, edit, and delete todos through a WebSocket-driven UI with instant sync — and ask an AI assistant for help organizing, prioritizing, and brainstorming your tasks.

## How This Was Built

This entire application was built from scratch in a single session using [metaswarm](https://github.com/dsifry/metaswarm), a multi-agent orchestration framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It serves as a reference example of what metaswarm can produce — and how.

Metaswarm provides 18 specialized agents, a 9-phase development workflow, and quality gates that enforce TDD, coverage thresholds, and spec-driven development. The build followed its full orchestration pipeline:

1. **Research & Planning** — Agents analyzed the issue spec, identified technical requirements, and produced a detailed plan with 16 work units
2. **Design Review Gate** — Five review agents (PM, Architect, Designer, Security, CTO) evaluated the plan in parallel and approved it
3. **Work Unit Execution** — Each of the 16 units went through a 4-phase loop: Implement → Validate → Adversarial Review → Commit
4. **Human Checkpoints** — Three checkpoints (database schema, API protocol, AI integration) required explicit human approval before proceeding
5. **PR Creation** — The completed feature branch was pushed and a pull request was opened

The result: 344 tests across 16 test files, ~18,000 lines of code, full-stack TypeScript with real-time sync and streaming AI chat — all orchestrated by agents with a human in the loop at key decision points.

## Running This App

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm 9+
- An [Anthropic API key](https://console.anthropic.com/) (required for the AI chat feature)

### Quick Start

```bash
# Clone and install
git clone https://github.com/dsifry/todo-chat.git
cd todo-chat
npm install

# Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start both servers (in separate terminals)
npm run dev          # Frontend — http://localhost:5173
npm run dev:server   # Backend  — http://localhost:3001
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The Vite dev server proxies API and WebSocket requests to the backend automatically.

The todo list works without an API key — you just won't have the AI chat feature. Add your `ANTHROPIC_API_KEY` to `.env` to enable it.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | For chat | -- | Anthropic API key for AI chat |
| `PORT` | No | `3001` | Backend server port |
| `HOST` | No | `127.0.0.1` | Backend server host |
| `DATABASE_PATH` | No | `./data/todos.db` | SQLite database file path |

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:server` | Start backend server with hot reload |
| `npm run build` | TypeScript compile + Vite production build |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check client and server code |
| `npm run format` | Format code with Prettier |

## Building Your Own App with Metaswarm

Want to build something like this from scratch? Here's how.

### 1. Install metaswarm

```bash
npm install -g metaswarm
```

See the [metaswarm README](https://github.com/dsifry/metaswarm) for full installation instructions.

### 2. Scaffold a new project

```bash
mkdir my-app && cd my-app
git init
metaswarm init
```

This sets up the `CLAUDE.md` config, agent definitions, and project structure that Claude Code needs to run the orchestration workflow.

### 3. Create a GitHub Issue with your spec

Write an issue that describes what you want to build. Be specific about the tech stack, features, and constraints. For this project, the issue described:

- A two-panel layout (todo list + chat)
- Real-time sync via WebSocket
- AI chat with Claude for task suggestions
- SQLite persistence
- Full test coverage

The more detail you put in the issue, the better the agents plan and execute.

### 4. Run the orchestration

Open Claude Code in your project directory and say:

```
Work on issue #1. Use the full metaswarm orchestration workflow.
```

Metaswarm takes over from there — researching, planning, decomposing work units, implementing with TDD, running adversarial reviews, and pausing at checkpoints for your approval. You stay in the loop at key decision points while the agents handle the implementation details.

### What to Expect

- **Human checkpoints** — You'll be asked to approve major architectural decisions before agents proceed
- **Adversarial reviews** — Each work unit is reviewed by a dedicated agent that looks for bugs, missing coverage, and security issues
- **TDD enforcement** — Tests are written before implementation; coverage thresholds are enforced
- **Incremental commits** — Each work unit is committed separately with a clear message, giving you a clean git history

For simpler tasks (bug fixes, small features), you can skip the full orchestration:

```
/project:start-task
```

This runs a lighter workflow without the full design review gate and work unit decomposition.

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, TypeScript
- **Backend:** Express, WebSocket (ws), better-sqlite3, TypeScript
- **AI:** Anthropic Claude SDK (streaming)
- **Testing:** Vitest, Testing Library, Supertest
- **Quality:** ESLint, Prettier, Husky

## Architecture

### Real-Time Sync

Todos sync in real time via WebSocket. When any client creates, updates, or deletes a todo, all connected clients receive the change instantly. The server sends a full `todo:sync` on connect, then incremental `todo:created`, `todo:updated`, and `todo:deleted` messages.

### AI Chat

The chat panel uses Server-Sent Events (SSE) to stream responses from Claude. The AI assistant can see your current todo list and suggest new todos — suggestions appear as clickable buttons that add items with one tap. Chat history is persisted in SQLite alongside your todos.

### Project Structure

```
src/
  client/              # React frontend
    components/        # TodoList, ChatPanel, Toast, ErrorBoundary
    hooks/             # useTodos, useChat, useWebSocket
  server/              # Express backend
    db/                # SQLite schema and queries
    routes/            # REST API (todos, chat)
    services/          # TodoService, ChatService, ClaudeService
    websocket/         # WebSocket handler
  shared/              # Types and validation (Zod schemas)
```
