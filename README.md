# Beans&Beats Queue

Order and pickup system for the Beans&Beats booth at Christmas Together 2026 (Hall F, Marina Bay Sands, 26 to 29 Nov).

|                             |                       |
| --------------------------- | --------------------- |
| **Live app**                | _to be added_         |
| **Demo video**              | _to be added_         |
| **Technical summary (PDF)** | _to be added_         |
| **Test logins**             | _added at submission_ |

## Stack

Next.js (App Router, Route Handlers) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Realtime) · Vitest · Vercel. Offline storage (IndexedDB + service worker) is added by its owner.

## Modules

| Module                | Route     |
| --------------------- | --------- |
| 1. Order screen       | `/order`  |
| 2. Barista queue      | `/queue`  |
| 3. Guest status page  | `/o/[id]` |
| 4. Ready board        | `/board`  |
| 5. Menu controls      | `/menu`   |
| 6. Daily sales report | `/report` |

## Setup

Needs Node 22 or later.

```bash
npm ci
cp .env.example .env.local   # then fill in the Supabase URL and publishable key
npm run dev                  # http://localhost:3000
```

Supabase helpers are in `src/lib/supabase/` (`client.ts` for the browser, `server.ts` for server code).

## Checks

These run in CI on every PR and must pass before merging:

```bash
npm run lint
npm run format:check   # npm run format fixes it
npm run typecheck
npm test
npm run build
```

## Workflow

1. Pick an issue on the project board (or create one), assign yourself and move it to **In Progress**.
2. Branch off the latest `main`: `git switch main && git pull && git switch -c 12-order-screen` (issue number + short name).
3. Commit in [SE-EDU style](https://se-education.org/guides/conventions/git.html): imperative, capitalised, no full stop, subject up to 72 characters, e.g. `Add one-tap status update`.
4. Push the branch to this repo and open a PR into `main` with `Closes #12`. Move the issue to **In Review**.
5. `main` is protected: merge once CI is green. Reviews are welcome but not required.

### Labels

- `type.*`: Story, Task, Bug, Enhancement, Epic
- `priority.*`: High (must do), Medium (nice to have), Low (unlikely to do)
- `severity.*`: for bugs, VeryLow to High
- `module.*`: order, queue, guest, board, menu, report; `area.*`: sync, auth for cross-cutting work

## Daily reset

_To be written by whoever owns event-day reset (F19)._
