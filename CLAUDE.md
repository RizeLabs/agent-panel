# Agent Panel

Tauri 2.x desktop app for orchestrating multiple Claude Code agents.

## Tech Stack
- **Backend**: Rust + Tauri 2.x, SQLite (rusqlite), tokio async runtime
- **Frontend**: React 19 + TypeScript + Vite, TailwindCSS, zustand, react-query
- **Integrations**: Telegram (teloxide), Notion (reqwest), claude-mem

## Architecture
- Agents are spawned as `claude` CLI processes via `tokio::process::Command`
- SQLite is the unified persistence layer: message bus, knowledge base, agent config, tasks
- "Breathe" pattern: agents run N turns, pause, get injected with new context, resume
- Hub-and-spoke coordinator reviews all shared findings periodically

## Key Conventions
- All Tauri IPC commands return `Result<T, String>`
- Agent status: idle | running | paused | error | stopped
- Message types: insight | question | task_update | finding | request | response
- Frontend uses zustand for client state, react-query for server state

## Project Structure
- `src-tauri/src/` - Rust backend (db/, agents/, orchestrator/, integrations/, skills/, commands/)
- `src/` - React frontend (components/, pages/, hooks/, lib/)

## Commands
- `npm run dev` - Start Vite dev server
- `npm run tauri dev` - Start Tauri app in dev mode
- `cargo check --manifest-path src-tauri/Cargo.toml` - Type-check Rust code
