# CERVICED waitlist site

Pre-launch marketing site. **Not part of the app build** — no React Native, no
Expo, no dependencies. Two files:

| File | What it is |
|---|---|
| `index.html` | The entire site. All CSS and JS inlined. |
| `waitlist_signups.sql` | The table the form wants to write to. **Never applied.** |

Nothing here imports from `src/`, and nothing in `src/` imports from here.

---

## Live

| URL | Status |
|---|---|
| https://www.cerviced.co | primary |
| https://cerviced.co | 308 → www |
| https://cerviced.vercel.app | same deployment |

Hosted on Vercel, auto-deploying from `main`. Push to `main` and it is live in
about 30 seconds. There is no build step — Vercel copies the folder.

**Vercel project settings that matter.** Root Directory must be `waitlist`;
Framework Preset `Other`; Build / Output / Install commands all empty with
their Override toggles off. If Root Directory ever reverts to `./`, Vercel
finds the app's `package.json` at the repo root, tries to build the Expo app,
and every URL 404s.

## DNS (Namecheap — `dns1/dns2.registrar-servers.com`)

```
www   CNAME  cname.vercel-dns.com
@     A      216.198.79.1
```

**`www` used to point at a Zoho landing page** (`zohohost.eu`). If you ever see
*"Oops! the page you are looking for could not be found … Get your landing page
from"*, that is Zoho's parking page, not Vercel and not a broken deploy. It was
served from stale DNS caches for a long time after the record was corrected.
Diagnose it by the response header, never by the browser:

```bash
curl -sI https://www.cerviced.co | grep -i server     # "Vercel" good, "ZGS" is Zoho
dig @dns1.registrar-servers.com www.cerviced.co CNAME +short   # bypasses all caches
curl -s --resolve "www.cerviced.co:443:76.76.21.22" https://www.cerviced.co | head
```

Flush a stale local cache with
`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`, plus Chrome's
own at `chrome://net-internals/#dns`. Checking on a phone with mobile data is
the fastest way to rule your own machine out.

---

## Editing it

The file lives on `main`. **Your local checkout is usually on a feature
branch**, so editing in place and committing puts the change on the wrong
branch. Use a detached worktree so the app working tree is never touched:

```bash
WT=$(mktemp -d)
git fetch origin main && git worktree add --detach "$WT" origin/main
cp waitlist/index.html "$WT/waitlist/index.html"     # after editing locally
cd "$WT" && git add waitlist/index.html && git commit -m "..." && git push origin HEAD:main
cd - && git worktree remove "$WT"
```

For a one-line typo it is quicker to edit at
`github.com/Cerve-678/CERVICED./blob/main/waitlist/index.html` and commit
straight to `main`.

## Design

Uses the **provider-hat** palette from `DESIGN_SYSTEM.md` (`L`/`D`), not the
client one: chocolate `#5C4033` on warm cream `#F5F1EC` in light, dusty rose
`#AF9197` on `#1A1815` in dark. The provider hat needs no `onAccent` split, so
white sits on both accents. Fonts are the app's two, from Google Fonts: Bakbak
One for display/labels/buttons, Jura for body.

Themed for all three viewer states — bare `:root` is the full light palette,
redefined under `prefers-color-scheme: dark` and again under
`:root[data-theme="dark"]`.

**The hero cart is interactive.** Chips add services from other providers, the
`×` removes them, the total counts rather than snaps, and the provider header
recounts — the point being to demonstrate "multiple providers, one checkout"
rather than assert it. Two chips are from providers already in the cart, so the
provider count deliberately stays put while the total moves. It will not empty
below one item. Sections settle in on scroll via IntersectionObserver. All
motion no-ops under `prefers-reduced-motion`, and three static rows are in the
markup if JS never runs.

---

## Outstanding — read before pointing anyone at this

**1. The privacy notice is a placeholder, and it is rendering live right now.**
A dashed box reading *"Privacy notice — placeholder, do not deploy"* is on the
public page. `LEGAL-COMPLIANCE-NOTES.md` §1 records that this project has no
Privacy Policy at all. A UK-facing form collecting email addresses needs a real
one under UK GDPR/PECR. **Do not draft this unilaterally** — per `CLAUDE.md`,
flag it and implement whatever wording the user directs.

**2. The form stores nothing.** `WAITLIST` at the top of the page script has
`supabaseUrl` and `anonKey` blank, so submitting says *"Preview mode — nothing
was sent."* No data has ever been captured.

**3. `waitlist_signups.sql` was never run.** The table does not exist. Its
`anon` policy is insert-only with **no** select policy on purpose, so the public
page can write signups but cannot read them back out. If it goes ahead it should
become a properly-timestamped migration, not an ad hoc run.

**Undecided:** whether signups belong in the live app Supabase project, a
separate marketing project, or a hosted form service. This was asked and never
answered.

Provider and client answers are already stored as separate columns, not one
blob — `business_name`/`services`/`current_tool` are provider-only,
`books_most` is client-only, and `role` filters between them.

**4. It lives inside the app repo.** Every waitlist tweak is a commit to the
app's `main`, and Vercel has read access to the whole private repo. A separate
repo would decouple them. Not urgent; worth doing before this sees real traffic.

## History

```
6114a37  make the hero cart demonstrate itself
888f5cb  provider/client toggle never hid anything
2c06ab0  quieter coming-soon copy, provider-hat palette
117191d  pre-launch landing page and signup capture
```
