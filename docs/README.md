# Project docs

Read these before writing code. The Google Docs and Sheets are where the team edits; these files are copies from 6 Nov 2026 so that everyone's AI agents can read them.

| File                                 | What it is                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| [overview.md](overview.md)           | Background, the six modules, technical requirements, deliverables, timeline |
| [decisions.md](decisions.md)         | What the team has agreed, and the open questions. Wins over everything else |
| [features.md](features.md)           | Feature list with owners, issue numbers and links to each spec              |
| [specs/](specs/)                     | One spec per feature: requirements, user flow, acceptance criteria          |
| [user-stories.md](user-stories.md)   | All user stories with priorities                                            |
| [design.md](design.md)               | The look: colours, type, buttons and UI rules every screen follows          |
| [architecture.md](architecture.md)   | Database diagram and data rules for the merged schema                       |
| [system-design.md](system-design.md) | The original system design, with a list of where the code now differs       |

When working on a feature:

1. Read its spec in `specs/` and the related rows in `decisions.md`.
2. Check the schema in `supabase/migrations/` before adding tables or functions.
3. Meet the spec's acceptance criteria, and add tests for new logic.
4. If the spec, the schema and `decisions.md` disagree, stop and ask the feature owner instead of guessing.
