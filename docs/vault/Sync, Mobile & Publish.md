# Sync, Mobile & Publish

How to carry the brain around and share it. (These are app/account steps — do them once.)

## On your phone 📱
1. Install **Obsidian** (iOS/Android, free).
2. Get the vault onto the phone — pick one:
   - **Obsidian Sync** (paid, ~$4/mo) — easiest, end-to-end encrypted, instant. Settings → Sync → set up a remote vault; select `docs/vault`.
   - **iCloud Drive** (free, iOS) — keep a *copy* of the vault in iCloud and open it there. Note: this is separate from the repo copy, so they can drift.
   - **Git on mobile** (free, fiddly) — apps like *Working Copy* (iOS) clone the repo; open `docs/vault` in Obsidian. Best if you want phone edits to land in git.

> The vault already lives in the repo, so on desktop it syncs for free via `git pull/push`.

## Git sync (desktop, free — already wired) 🔁
The vault is version-controlled with your code. To make it automatic inside Obsidian:
- Install the **Obsidian Git** community plugin → set "auto commit + push" every N minutes and "pull on startup".
- Now notes sync across machines through your normal git remote, alongside the `auto/` notes the [[Code Index]] generator refreshes.

## Templates (one-click capture) 🧩
Enable the built-in **Templates** core plugin:
- Settings → Core plugins → **Templates** → on.
- Settings → Templates → **Template folder location** = `_templates`.
- Insert with the command palette → "Insert template" (or bind a hotkey). Templates available: **bug**, **feature**, **decision**.

Optional upgrade: the **Templater** community plugin adds dynamic templates (auto-filename, prompts, running code on insert).

## Share it 🤝
- **Obsidian Publish** (paid) — publishes selected notes as a website with the graph. Settings → Publish. Good for a cofounder/contractor who shouldn't touch the repo.
- **Free alternatives**: the repo itself (they read the markdown on GitHub), export a note to PDF (right-click → Export), or **Quartz** (open-source static-site publisher for Obsidian vaults).

> ⚠️ Before publishing: this vault documents security internals (RLS, address gating, auth). Don't publish it anywhere public. Keep it to the repo or a private Publish site.

## Connections
[[Home]] · [[Setup — Using This Vault]] · [[Code Index]]
