# Setup — Using This Vault

## Open it
1. Install **Obsidian** (obsidian.md, free).
2. *Open folder as vault* → pick `docs/vault/` in this repo.
3. Open [[Home]]. Turn on the **graph view** (left sidebar, or ⌘/Ctrl-G) to see the web.

The vault lives **inside the repo** on purpose — it version-controls with the code, and anyone who clones gets the brain.

## The three things that make it a "brain"
- **Wiki-links** — `[[Note Name]]` connects notes. Type `[[` and Obsidian autocompletes.
- **Graph view** — every link becomes an edge. This is the "how everything connects" picture.
- **Backlinks** — each note shows what links *to* it (bottom of the pane). Follow connections backwards.

## Linking to source code
Obsidian only graphs `.md` files, not your `.tsx`/`.sql`. So notes reference code as plain paths, e.g. `src/contexts/BookingContext.tsx`. Keep your editor open beside Obsidian — Obsidian is the *map*, the editor is the *territory*.

## Recommended community plugins
Settings → Community plugins → Browse:
- **Obsidian Git** — auto-commit/sync the vault (and pull teammates' notes). Set it to commit every few minutes.
- **Dataview** — query notes like a database (e.g. list every note tagged `#security`).
- **Excalidraw** — hand-drawn architecture diagrams that can embed links.
- **Canvas** (built-in, no install) — drag notes onto an infinite board to draw the system visually. Great for a "one big picture" board.

## Keeping it true as the code changes
This vault is **half auto, half curated**:
- **`auto/` folder** — regenerated straight from the code by `scripts/gen-vault.mjs` (screens, services + exports, contexts, routes, every DB object). Never hand-edit these; they carry a ⚠️ banner. See [[Code Index]].
- **Everything else** — the narrative ("how it connects", the "why"). Hand-written; you maintain it.

### The automation
- **On commit**: a git hook (`.githooks/pre-commit`) runs the generator whenever `src/` or `supabase/` is part of the commit, and stages the refreshed `auto/` notes. So the facts are never stale. Output is deterministic, so untouched commits stay clean.
- **Manual**: `npm run vault`.
- **Live while coding**: `npm run vault:watch` regenerates on every save.
- **First-time setup on a new clone**: `npm install` runs the `prepare` script which points git at `.githooks`. (Or run `git config core.hooksPath .githooks` once.)

For the *curated* notes, ask me to regenerate/expand any after a big change — I re-read the code and refresh the narrative.

## Tags used here
`#security` `#server-authoritative` `#client-decides` `#todo` `#needs-verification` — use the search or Dataview to slice across notes.

## Connections
[[Home]] · [[Architecture Overview]]
