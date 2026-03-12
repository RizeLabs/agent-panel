# Mission Control

A desktop app for orchestrating multiple Claude Code agents simultaneously. Spawn, monitor, and coordinate AI agents — with a swarm view, task board, shared knowledge base, and integrations with Telegram and Notion.

![Tauri](https://img.shields.io/badge/Tauri-2.x-blue) ![React](https://img.shields.io/badge/React-19-blue) ![Rust](https://img.shields.io/badge/Rust-stable-orange)

## What it does

- **Agents** — spawn Claude Code agents as subprocesses, configure their role, model, and max turns
- **Swarm** — group agents into a swarm with a shared goal and a coordinator that reviews findings
- **Tasks** — drag-and-drop task board to assign work across agents
- **Knowledge Base** — shared memory that agents read from and write to via SQLite
- **Message Feed** — real-time message bus showing inter-agent communication (insights, questions, findings)
- **Skills** — define reusable prompt-based skills that agents can invoke
- **Integrations** — Telegram bot for remote monitoring, Notion for syncing findings

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2.x |
| Backend | Rust, tokio, rusqlite |
| Frontend | React 19, TypeScript, Vite, TailwindCSS |
| State | zustand (client), react-query (server) |
| Persistence | SQLite |
| Integrations | Telegram (teloxide), Notion (reqwest) |

## Architecture

Agents are spawned as `claude` CLI subprocesses via `tokio::process::Command`. SQLite is the unified persistence layer — it acts as the message bus, knowledge base, agent config store, and task tracker.

The **"breathe" pattern**: agents run N turns, pause, receive injected context from the coordinator, then resume. A hub-and-spoke coordinator periodically reviews all shared findings and redistributes context.

```
┌─────────────────────────────────────┐
│            Mission Control          │
│                                     │
│  ┌─────────┐     ┌───────────────┐  │
│  │ Agents  │────▶│  Message Bus  │  │
│  └─────────┘     │   (SQLite)    │  │
│       │          └───────────────┘  │
│       ▼                │            │
│  ┌─────────┐           ▼            │
│  │  Tasks  │     ┌───────────────┐  │
│  └─────────┘     │ Knowledge Base│  │
│                  └───────────────┘  │
└─────────────────────────────────────┘
         │               │
    Telegram           Notion
```

## Getting Started

**Prerequisites**
- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://claude.ai/code) CLI installed and authenticated

**Install dependencies**
```bash
npm install
```

**Run in development**
```bash
npm run tauri dev
```

**Type check**
```bash
# Rust
cargo check --manifest-path src-tauri/Cargo.toml

# TypeScript
npx tsc --noEmit
```

## Project Structure

```
mission-control/
├── src/                        # React frontend
│   ├── components/
│   │   ├── agents/             # AgentCard, AgentConfig, AgentList, AgentLog
│   │   ├── swarm/              # SwarmView, SwarmGraph, MessageFeed, KnowledgeBase
│   │   ├── tasks/              # TaskBoard, TaskCard
│   │   ├── skills/             # SkillEditor, SkillList
│   │   ├── settings/           # GeneralSettings, TelegramConfig, NotionConfig
│   │   └── layout/             # Header, Sidebar, Layout
│   └── pages/                  # Dashboard, Agents, Swarm, Tasks, Skills, Settings
│
└── src-tauri/src/              # Rust backend
    ├── agents/                 # Agent spawning & lifecycle
    ├── orchestrator/           # Message bus, coordinator logic
    ├── db/                     # SQLite schema & queries
    ├── skills/                 # Skill manager
    ├── integrations/           # Telegram, Notion, claude-mem
    └── commands/               # Tauri IPC command handlers
```

## Key Conventions

- All Tauri IPC commands return `Result<T, String>`
- Agent status: `idle | running | paused | error | stopped`
- Message types: `insight | question | task_update | finding | request | response`

## Hooks

The project includes Claude Code hooks in `.claude/hooks/`:

- **`beep.sh`** — plays a sound when Claude finishes a task
- **`install-beep-hook.sh`** — one-command installer for the beep hook

Install the beep hook globally:
```bash
curl -fsSL nitanshu.com/scripts/beep.sh | bash
```
