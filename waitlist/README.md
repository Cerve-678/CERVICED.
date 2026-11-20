# CERVICED website (www.cerviced.co)

Two parts, built together by `scripts/build-site.mjs` (`npm run build:site`
locally, into `dist/`; on Vercel, into `waitlist/dist/`):

| Part | What it is |
|---|---|
| `waitlist/` (this folder) | The static pages: Home (`index.html`), About (`about/`), Legal (`legal/`). All CSS and JS inlined, no dependencies. Copied into the build unchanged. |
| `src/web/` | The web app, built by Expo (react-native-web) from `App.web.tsx`. It serves provider pages at `/@handle` with the app's own page components (`src/features/providers/page/`). Its `index.html` becomes `app.html`. |

Nothing in `src/` imports from `waitlist/`. Until provider pages are built
(web booking plan, step 3) `/@handle` shows "This page is coming soon".
In a development build, `/_dev/page-styles?style=<key>` draws the shared
provider page with a sample provider in any page style.

## Live

| URL | Status |
|---|---|
| https://www.cerviced.co | primary |
| https://cerviced.co | 308 → www |
| https://cerviced.vercel.app | same deployment |

Hosted on Vercel, auto-deploying from `main` (about 2 minutes: install,
then the Expo web export).

**Vercel project settings that matter (since the web app, 2026-11-20).**
Root Directory stays `waitlist`, Framework Preset `Other`, and "Include
files outside the Root Directory in the Build Step" must stay on. Install,
build and output come from `waitlist/vercel.json`, so the Override toggles
stay off: it installs and builds from the repo root (`cd ..`) into
`waitlist/dist`, because Vercel's output has to sit inside the Root
Directory. `waitlist/vercel.json` also:

- rewrites `/@:handle` to `/app.html` (the web app);
- skips the build for any branch that isn't `main` and doesn't have `site`
  or `web` in its name (`scripts/vercel-ignore-build.sh`), because the Hobby
  plan rate-limits builds;
- caches the web app's hashed files (`/_expo/static/…`) for a year.

The Supabase URL and anon key are read from `eas.json`'s production profile
at build time, so Vercel needs no environment variables. If a merge shows no
Vercel deployment, push an empty `chore(site): redeploy` commit to `main`.

To roll back to the static-only site, use Vercel's Instant Rollback on the
last good deployment. A failed build never replaces the live site.

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

**1. The privacy notice is the legal page.** The consent line and the footer
link to `/legal#privacy`. The old placeholder box was removed on 2026-11-03.
That page is still a draft — see item 5.

Since 2026-11-08 both pages share the same header menu (About us, How it works,
Health & safety, Terms & policies, Join the waitlist) and a four-column footer
that links every policy on `/legal` by its section id (`#terms`,
`#provider-terms`, `#privacy`, `#cookies`, `#fees`, `#safety`, `#providers`,
`#community`, `#reviews`, `#complaints`) plus `/about` (the About page, `about/index.html`) and the home page's
`#for-you` and `#join`. The app's About row opens `/about` too, so it is the
only copy of the About text. If you rename or add a policy section, update both
footers. Every page has a light/dark switch in the header (`#theme-toggle`). A
visitor's choice is saved in localStorage as `cerviced-theme` and applied by a
small script in `<head>` before first paint; with no choice saved, the page
follows the device. The About page's animations (hero, "one client's month",
the one-cart demo, scroll reveals) run only under `html.motion`, which that
same script sets when the device allows motion; otherwise everything is simply
shown. The one-cart markup is the finished cart, and the script empties it and
plays it in, so a visitor without script still sees the whole thing.
The footer contact is support@cerviced.co, the address the legal page
uses (the old footer said hello@cerviced.com).

**2. Where sign-ups go (since 2026-11-10).** The form posts to
`public.waitlist_signups` in the app's live Supabase project, created by
`supabase/migrations/20261110150000_waitlist_signups.sql` (the user chose the
app's database over a separate project or a form service). `WAITLIST` at the top
of the page script holds the project URL and the app's publishable anon key,
the same one every app build ships. The table lets `anon` INSERT only, with
length and shape checks in the policy; there is **no** select, update or delete
for anon or authenticated, so the list can't be read back through the website.
Read it in the Supabase dashboard (Table Editor → waitlist_signups). A repeat
email on the same side is a 409, shown as "You're already on the list".
Nothing was captured before 2026-11-10.

Provider and client answers are already stored as separate columns, not one
blob — `business_name`/`services`/`current_tool` are provider-only,
`books_most` is client-only, and `role` filters between them.

**4. It lives inside the app repo, on purpose now.** The web app renders the
app's own provider page components, so it has to build from this repo.

**5. `legal/index.html` is a draft, not lawyer-reviewed.** It holds all of
Cerviced's policies on one page (served at `/legal` once on `main`): Client
Terms, Provider Terms of Business, Privacy, Cookies, Fees & Refunds, Provider
Standards, Community, Reviews, Health & Safety, Complaints. It was drafted on
2026-10-19 at the user's direction. Since 2026-11-03 the waitlist page and the
app's Welcome and sign-up screens link to it. Still to do:
- company number, registered office and ICO registration number were taken
  out for now at the user's request (not left as blanks). Put them back once
  known: UK companies must show the number and registered office on their
  website. The provider liability cap is still a highlighted blank;
- have a solicitor review it, then remove the `noindex` meta tag;
- keep the Client Terms in step with the app's `TermsScreen.tsx`. They're the
  in-app Terms rewrite (PR #115) minus its §31 "For Providers", which moved into
  the Provider Terms, plus three website-only sentences: other policies form
  part of the Terms (§1), Cerviced as the provider's commercial agent (§9), and
  no moving Cerviced bookings off the app (§28). The app needs the same split.
- Payout timing stays general on purpose (no day counts). That was the user's
  decision.

## History

```
6114a37  make the hero cart demonstrate itself
888f5cb  provider/client toggle never hid anything
2c06ab0  quieter coming-soon copy, provider-hat palette
117191d  pre-launch landing page and signup capture
```
