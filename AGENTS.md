<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Read first

Before writing code, read [`docs/README.md`](docs/README.md). It lists the team's agreed decisions, the feature list, one spec per feature and the database design. The spec for your feature and `docs/decisions.md` decide what to build. If they disagree with each other or with the schema in `supabase/migrations/`, ask the feature owner instead of guessing. Then follow [`docs/building.md`](docs/building.md) for how to plug in: `StaffWorkspace` and `requireStaff()` for staff screens, new `p_staff_id` database functions in a new migration file, and the design tokens.

## Project rules

- Follow the workflow in README.md: one branch and PR per issue, `Closes #N` in the PR, CI must be green.
- Commit messages follow SE-EDU style: imperative, capitalised, no full stop, subject up to 72 characters.
- Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` and `npm run build` before pushing.
