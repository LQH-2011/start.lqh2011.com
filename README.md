# start.lqh2011.com

Personal browser start page — minimalist, in the same style as the blog.

## Structure

- `index.html` — single self-contained page (inline CSS, no dependencies):
  - **Logo**: "LQH-2011" as 5×7 pixel-block glyphs (SVG `<use>` + `<rect>`), with a
    checkerboard-patterned block shadow offset down-right. Doubles as a live
    HH:MM:SS block-art clock via the `c` command (see Features).
  - **Bar**: the input doubles as a URL opener (default) and a search bar.
    Type a URL and press Enter to open it in a new tab (a bare domain — or a
    `host:port` like `localhost:3000` / `example.com:8080` — gets `https://`
    prepended); type `aaa` (or `/` or `-`) to enter command mode. When the
    bar is not focused, global shortcuts still work (`a`, `/`, `-`, `s`, `c`, `k` —
    see Features).
  - **Bookmarks**: rendered from `localStorage` (`start.bookmarks`) and editable in
    settings → links (`a` add, `e` edit, `x` delete, digits open). First run uses the
    original hardcoded list as defaults.

## Features

- **Dark mode**: the page follows your system theme (`prefers-color-scheme`) by
  default, live — switch the OS theme and it follows without a reload. Type `aaa`
  then `k` in the search bar to cycle through the three choices: **system**
  (the default), then the opposite of what's shown, then the other explicit
  choice, then back to **system** — so auto mode is always one or two presses
  away. The choice is saved in `localStorage` (`start.theme` — `sys`, `light`
  or `dark`) and restored on the next load. The choice is **device-specific**:
  it stays in that device's `localStorage` and never syncs to your other devices.
  The block logo and its shadow adapt via CSS variables.
- **URL opener (default)**: the bar starts in URL mode (globe indicator). Type a URL and
  press Enter to open it in a new tab — a bare domain (`example.com`) or a host:port
  (`localhost:3000`, `example.com:8080`) gets `https://` prepended automatically, URLs
  with an allowed scheme (`https://…`, `mailto:…`, `tel:…`) open as-is, and any other
  scheme (`javascript:`, `data:`, …) is rejected.
- **URL history**: the opener records the 20 most recent URLs (`start.history`) and
  syncs them across devices like the other settings (last-write-wins per key; the
  server stores the latest 20-item list, never an accumulation). While the bar has
  text in url mode, a dropdown the same width as the bar lists the entries matching
  what you've typed (case-insensitive substring, scheme ignored — `git` finds
  `github.com`), most recent first. The first row is always **Abrir este URL…**: it
  opens the typed text as a URL, so a new URL that happens to be a substring of an
  older one (`example.com` typed after `subdomain.example.com`) is still reachable
  with Enter instead of being captured by the old entry. The matching history
  entries follow, and the action row is highlighted by default. `↑`/`↓` move the
  highlight (wrapping), **Enter** (or a click) opens the highlighted row, **`d`**
  deletes the highlighted history entry, `Esc` or clicking away closes the menu,
  and it never appears with an empty bar or in search mode. The combobox is exposed
  to screen readers (`aria-controls`/`aria-expanded`/`aria-activedescendant`).
- **Command mode**: type `aaa` (or `Aaa` / `/` / `-`, case-insensitive) in the bar to
  enter command mode (the indicator swaps to a `❯` on the left; the input stays
  left-aligned). Then (letters are case-insensitive):
  - `a` — **Abrir**: back to the URL opener (selected top mode, persisted)
  - `b` — **Buscar**: back to the search bar (selected top mode, persisted)
  - `c` — toggle the "LQH-2011" logo and a live HH:MM:SS block-art clock (stays in
    command mode)
  - `f` — toggle full screen via the browser Fullscreen API (stays in command mode;
    a no-op where the API is missing or the browser rejects the request)
  - `k` — cycle theme: system → opposite of the OS theme → other explicit theme → system (stays in command mode)
  - `p` — **Pull**: fetch the latest synced settings from the DB and apply
    them live — bookmarks, history, engine, top mode, clock and timer
    change in place, no page reload (stays in command mode)
  - `s` — **Settings**: open the settings mode (gear indicator); typing `/` or
    `-` again in command mode does the same
  - `t` — **Timers**: open the named-timers manager (timer indicator)
  - `u` — start a quick count-up from `00:00` (creates a new named timer)
  - `y` — start the active timer (a countdown restarts from its saved
    duration, a count-up from `00:00`); this clears a paused timer
  - `h` — toggle hours (`MM:SS` ↔ `HH:MM:SS`) for the active timer (stays in
    command mode)
  - `z` — **pause/resume** the active timer: a running timer freezes at its
    current value, and `z` again resumes from where it stopped (not a reset)
  - `r` — **reset** the active timer to its initial state (a countdown back to
    its configured duration, a count-up to `00:00`)
  - `x` — **delete** the active timer (confirm `s`/`y`)
  Any other character exits command mode and keeps the text as-is in the selected top
  mode; Enter on an empty prompt returns to the top, and Backspace (on an empty prompt)
  or Escape climb one level up.
- **Settings mode**: `s` from command mode opens it (gear indicator). Then
  (case-insensitive):
  - `b` — Bing (default)
  - `g` — Google (`https://www.google.com/search`)
  - `d` — DeepSeek chat (`https://chat.deepseek.com/?q=…`)
  - `w` — Wikipedia (`https://en.wikipedia.org/w/index.php`, `name="search"`)
  - `f` — Jacky Forum (`https://f.m14ga.org/?q=…`)
  - `e` — RAE Diccionario del Estudiante (`https://www.rae.es/diccionario-estudiante/{q}` —
    the query goes in the URL path)
  - `c` / `k` — same toggles as in command mode (stay in settings)
  - `l` — **Favoritos**: open the links/bookmarks submenu
  - `t` — **Temporizadores**: open the timers submenu — a visible dropdown of the
    named timers (name, UP/DOWN, live time) to select, start, pause/resume, reset,
    rename or delete
  - `x` — **Cerrar sesión** (logout): type `s` (or `y`) and press **Enter**
    to wipe `localStorage` and `sessionStorage` — sync token, settings and
    bookmarks — and reload the page, so the password overlay returns; type
    any other response and press Enter, or press Escape or Backspace on an
    empty prompt, to cancel back to settings
  - `r` — reset the active timer to its initial state (stays in settings)
  Engine keys exit settings back to the search bar with the new engine, and make
  the search bar the selected top mode (so backspace/Enter return to it). Backspace
  on an empty prompt goes one layer up (settings → command); Enter returns straight
  to the top. The engine choice is saved in `localStorage` (`start.engine`) and
  restored on load.
- **Bookmarks (Favoritos)**: `l` in settings mode opens the links submenu — the gear
  indicator stays. Then
  (case-insensitive):
  - `1`–`9` — open that bookmark in a new tab (digits cover the current bookmark
    count, up to 9)
  - `a` — **Añadir**: type the URL and press Enter (bare domains get `https://`
    prepended, dangerous schemes like `javascript:` are rejected); then type a label
    and press Enter (an empty label uses the URL itself)
  - `e` — **Editar**: press the bookmark number, then edit the URL and the label —
    the current values are pre-filled, and Enter on an empty field keeps them
  - `x` — **Borrar**: press the bookmark number, then confirm with `s` (or `y` —
    any other key cancels)
  - `c` / `k` — same toggles as in settings; `r` — refresh/reload (links mode keeps
    the page reload, unlike the other submodes where `r` resets the active timer)
  Backspace on an empty prompt cancels a flow and climbs one level (links →
  settings → command); Escape cancels a flow or climbs the same stack mid-typing;
  with no flow active, Enter on an empty prompt exits to the top (during a flow
  Enter commits the current step). Bookmarks are saved to `localStorage`
  (`start.bookmarks`) and sync across devices like the other settings.
- **Global shortcuts (bar not focused)**: after clicking a bookmark link (or anywhere
  else), the bar loses focus — these page-level keys still work:
  - `a` — refocus the url/search bar, keeping the current top mode
  - `/` or `-` — enter command mode directly
  - `s` — open settings mode directly
  - `t` — show the active timer (focus stays where it is); with no active timer,
    enter timer setup and focus the bar
  - `z` — pause/resume the active timer (focus stays where it is)
  - `r` — reset the active timer (focus stays where it is)
  - `x` — delete the active timer (confirm `s`/`y`; enters command mode for the prompt)
  - `c` — toggle the block-art clock (focus stays where it is)
  - `k` — cycle theme: system → opposite of the OS theme → other explicit theme → system (focus stays where it is)
  Modifier combos (`Ctrl+…`, `Cmd+…`, `Alt+…`) are never intercepted. While any
  editable element is focused (the bar, a textarea, `contenteditable`) these keys
  type into it normally (in-bar `/` or `-` still enters command mode).
- **Pinned-link keys (`1`–`9`)**: press a digit to open the matching bookmark in a
  new tab — `1` is the first link in the bookmarks list; the range follows the current
  bookmark count (max 9). They work in three situations: when the bar is **not**
  focused, while the bar is focused in **command** mode (`aaa`, `/`, or `-`), and in
  **links** mode. In url/search/settings mode the digits type into the bar normally
  (so URLs like `1.1.1.1` still work). Modifier combos (`Ctrl+1` / `Cmd+1` tab
  switching, etc.) and held-key repeats are never hijacked.
- **Block-art clock**: type `aaa` then `c` in the search bar to swap the logo for a live
  clock in the same 5×7 pixel-block style (digits and colon are glyphs in the same SVG
  `<defs>`; the seconds tick every 1000 ms). Press `c` again to switch back. The choice
  is saved in `localStorage` (`start.clock`, `on`/`off`) and restored on the next load.
- **Timers**: the page now has a LIST of named timers, each either a count-up or a
  count-down, and they can all run at once. One is bound to the logo slot at a time
  (the others keep counting in the background); the timers manager dropdown shows them
  all and selects which one is shown.
  - **Countdown formats**: a plain integer is minutes (`25` = 25 min), `MM:SS` (`05:00`),
    or `HH:MM:SS` (`1:30:00`). A duration of one hour or more (`60`, `90`, or `90:00`)
    auto-converts to `HH:MM:SS`. A created timer lands in the named list (default name
    "Temporizador") and **starts running immediately**; it can be renamed from the manager.
  - **Quick count-up**: type `aaa` then `u` for a count-up that starts at `00:00`.
  - **Timers manager (`t` in command mode, or settings → `t`)**: a visible dropdown (same
    design as the URL-opener history dropdown) lists every timer — name, a `UP`/`DOWN`
    badge and a live `MM:SS`/`HH:MM:SS` reading that **ticks for a running timer** and sits
    still for a paused/stopped one. `↑`/`↓` move the highlight (wrapping), **Enter** starts
    the highlighted timer (same as `y`), and `1`–`9` select & show that timer by
    position (1 = first). `a` **Añadir** (name → type: `u`/`d` → duration for a countdown),
    `e` **Editar** (rename, and the duration for a countdown), `x` **Borrar** (confirm
    `s`/`y`), `y` **start** the highlighted timer, `z` **pause/resume** it, `r` **reset**
    it (idle), plus the usual `c`/`k` toggles. An idle countdown shows its configured
    length (e.g. `25:00`); an idle count-up shows `00:00`.
  - The timer replaces the logo at the top in the same block-art style; it shows `MM:SS`
    by default and `HH:MM:SS` once the duration/elapsed time reaches one hour. `h` (in
    command mode) toggles the hours display manually.
  - **Background running**: every timer keeps ticking even when its display is hidden —
    `c` while a timer is shown hides it and brings back the clock (or `c` again, the logo)
    without stopping it, and the global `t` (bar not focused) brings it back. Timers are
    timestamp-based, so a hidden countdown keeps the correct remaining time.
  - **Survives reloads**: the timer list, the timer bound to the slot, and its visibility
    are saved in `localStorage` under `start.timers`, `start.timerActive` and
    `start.timerVisible`, so a countdown resumes with the correct remaining time, a
    count-up keeps counting, a finished countdown flips to a count-up anchored at its end
    (and flashes for a few seconds), and a hidden timer reloads back into the clock/logo
    view. A paused timer reloads paused (frozen value).

## Sync (cross-device settings)

Since the settings sync backend landed, the page is **local-first**: it renders
instantly from `localStorage` exactly as before, and syncs to a small API + database
in the background. On the first visit from a device you enter the page password once;
after that the device holds a token and behaves exactly as before.

- **One-time password gate**: with no token in `localStorage`, a minimal overlay
  (matching the page design) asks for the password. On success a signed token is
  stored (`start.token`, valid 90 days); on failure the overlay shows an error.
  To log out, press `x` in settings mode, type `s` (or `y`) and press Enter:
  the page wipes `localStorage` and `sessionStorage` — token included — and
  reloads, so the overlay returns on that device (the synced data stays in
  the DB for the other devices). Any other response on Enter cancels.
- **Local mode (no backend)**: typing `local`, `test` or `debug` as the password
  logs you in **without contacting the API** — no token, no pull, no push; all
  settings and bookmarks stay in `localStorage` only. The mode is remembered
  across reloads (`start.localMode`), so the overlay doesn't come back. A banner
  at the bottom (gray backdrop) tells you you're in local mode, and the typing
  bar shows the **warning icon permanently** instead of the sync spinner/tick.
  Log out (`x` in settings) to wipe local state and return to the password gate.
- **Pull on load**: after auth, settings are pulled from the DB and merged into
  `localStorage` — **last-write-wins per key by timestamp** (each value carries an
  epoch-ms timestamp; a newer local value is never clobbered, and an older server
  value never overwrites a newer one). If anything changed the page reloads once so
  the restored state matches your other devices (unless you're already typing — then
  it applies on the next load). While the page is open, `p` in command mode runs the
  same pull **without reloading**: the merged state (bookmarks, history, engine,
  top mode, clock, timer) is applied live, so changes made on another device
  show up immediately.
- **Push on change**: every existing `save()` (mode, engine, clock, timer list,
  bookmarks, history — including resetting a timer, which updates the list to an idle
  state) schedules a debounced POST
  to the API. Offline? The change stays local and is retried on the next change or
  load. Server-side last-write-wins protects against a stale offline device.
- **Timers sync too**: `start.timers` stores absolute end/start timestamps per timer,
  so a countdown started on one device resumes on another with the correct remaining
  time — and every named timer, its kind, its configured duration, which timer owns the
  display slot (`start.timerActive`) and whether it was shown (`start.timerVisible`)
  sync like the other settings.
- **What syncs**: `start.mode`, `start.engine`, `start.clock`,
  `start.timers`, `start.timerActive`, `start.timerVisible`, `start.timerHours`,
  `start.bookmarks`, `start.history` — and notably NOT
  `start.theme`, which is device-specific (each device keeps its own
  system/light/dark choice in `localStorage`). The sync bookkeeping itself lives
  in `localStorage` under `start.sync.ts` (per-key timestamps) and is never uploaded.
- **No visible chrome (connected mode)**: no status indicators — the page looks identical.
  Sync failures are silent (console) and self-healing. (The one exception is
  **local mode**, which intentionally shows a banner + a permanent warning icon.)

## AI chat (`j` from command mode)

A full chat UI built into the start page, powered by the same Vercel API + Neon
DB as the sync backend (single-user; you must be logged in with a synced token).

- **Enter**: in command mode press `j`. The logo collapses and the search bar
  docks to the bottom with smooth transitions; the left mode indicator becomes
  a hamburger and the right sync icon is replaced by a send (up-arrow) button.
  The placeholder is `Pregunta algo...`. **Exit**: type `/` then `x` — it returns
  to command mode with the normal logo/bar layout.
- **Send**: type in the bar and press Enter (or click the arrow). The reply
  streams in as it's generated; both the user message and the bot reply are
  rendered as markdown (headings, lists, code blocks, links, emphasis).
- **Per-message actions**: copy and delete under *every* message; regenerate
  under bot messages. All write through the API.
- **Session sidebar**: a hamburger at the top-left slides in the past sessions,
  sorted by most-recent use and grouped into *Hoy / Ayer / Esta semana /
  Anteriores*. Clicking a session loads its thread; the title is generated from the
  first message of the thread. Un botón **Nueva conversación** at the top of the sidebar
  starts a fresh thread, and a blank thread shows the "Think before you ask."
  block-art welcome (same 5×7 pixel-glyph style as the logo, at quarter scale).
- **Persistence**: sessions + messages live in Neon (`chat_sessions`,
  `chat_messages`). The AI provider (any OpenAI-compatible base URL) is proxied
  server-side via `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` — the key never leaves
  the server. See the Deploy section.

## Editing the logo

Glyph maps live in the 5×7 grid definitions inside the `<svg>` `<defs>`; each glyph is a
group of `<rect>` blocks. The shadow pattern is the `#shadow` `<pattern>` (checkerboard).
The page was generated from the `gen_block_logo.py` script in the
`static-html-artifacts` skill (pixel-font maps → SVG) — ask the assistant
to regenerate if you want bigger cells, different glyphs, or a different shadow pattern.

## Persistence (localStorage)

- `start.mode` — `url` or `search`; the selected top mode, restored on load
  (invalid values → url, the default).
- `start.activeMode` — per-tab one-shot flag (`command` or `settings`), stored in
  `sessionStorage` (NOT `localStorage`, so other same-origin tabs can't consume or
  overwrite it); set when `r` is pressed in command/settings mode, cleared after the
  reload restores that submode.
- `start.engine` — `bing`, `google`, `deepseek`, `wikipedia`, `jackyforum`, `rae`; restored on load.
- `start.theme` — `sys`, `light` or `dark`; restored on load. `sys` (the default
  when absent) follows the OS `prefers-color-scheme` live; `light`/`dark` are
  explicit choices reached by cycling with `k` (system → opposite of the OS theme → other explicit theme → system).
  Device-specific — never synced.
- `start.clock` — `on` or `off`; restored on load (clock shown when `on`).
- `start.timers` — the named timer list: a JSON array of
  `{id, name, kind:'up'|'down', dur, end, start, paused}` objects (absolute timestamps
  where set; `paused` is `{secs, phase}` when a timer is paused); restored on load; the
  old single-timer record (`start.timer`) is migrated into a one-element list on first load.
- `start.timerActive` — the `id` of the timer currently bound to the display slot
  (absent when none); synced like the rest.
- `start.timerVisible` — `1`/`0`; whether the display slot showed the active timer (vs.
  the clock/logo) when it was saved, so a reload lands back on the same view.
- `start.timerHours` — `1`/`0`; the `h` hours-display preference (MM:SS vs `HH:MM:SS`),
  restored on load.
- `start.bookmarks` — the bookmark list: a JSON array of `{label, url}` objects,
  edited from settings → links; restored on load; first run defaults to the original
  hardcoded links.
- `start.history` — the URL-opener history: a JSON array of the 20 most recent
  normalized URLs (most recent first, deduped); restored on load; first run is empty.
  Synced like the other settings — the DB keeps only the latest 20-item list (the
  per-key last-write-wins KV), so stored history never grows unbounded. Note: URLs can
  contain private identifiers/tokens; the synced value sits on the user's own sync
  server in plaintext, by explicit choice.
- `start.token` — the sync session token (set after the one-time password; drives
  the auth overlay and the API calls). It is sent to the API as a bearer token
  and is never included in the synchronized key/value payload.
- `start.localMode` — `1` when the page runs **without the backend** (logged in
  with the password `local`/`test`/`debug`). Never synced; when present, the page
  skips the overlay, the pull and the push entirely and shows a banner + a
  permanent warning icon.
- `start.sync.ts` — sync bookkeeping: a JSON map of key → epoch-ms timestamp
  (last-known write time per synced key). Used for last-write-wins merging; never
  uploaded itself.

## Deploy

The **frontend and API are served by one Vercel project** at
https://start.lqh2011.com — the static `index.html` plus the `api/` serverless
functions, same-origin, with Neon Postgres for storage. (The former
`start-api.lqh2011.com` subdomain is retired; there is no separate API host.)

### 1. Neon (database)

1. Create a project at https://console.neon.tech (free tier is plenty — one table).
2. Copy the **pooled** connection string (Project Dashboard → Connect → Pooled,
   looks like `postgres://…-pooler…`). It contains the DB password.
3. Create the tables — run `schema.sql` (the sync `kv` table **and** the AI chat
   `chat_sessions` + `chat_messages` tables; all are `CREATE ... IF NOT EXISTS`, so
   re-running is safe, but existing deployments need to run it once again to add
   the chat tables). Easiest: paste it into Neon's SQL editor; or
   `psql "$DATABASE_URL" -f schema.sql`.

### 2. Secrets (local)

```sh
npm install
npm run hash            # prints a random password + its AUTH_PASSWORD_HASH
openssl rand -hex 32    # -> AUTH_TOKEN_SECRET
```
Save the password somewhere safe — it's what you'll type on each new device.

### 3. Vercel (API)

1. Import this repo at https://vercel.com/new (Framework Preset: **Other**).
   Vercel auto-detects the `api/` directory and deploys `/api/auth`,
   `/api/data`, and the AI chat routes (`/api/chat`, `/api/chat-sessions`,
   `/api/chat-messages`) as serverless functions.
2. Add these Environment Variables to the project (Settings → Environment Variables).
   Add each one to **both the Production and Preview environments** — the
   preview (e.g. `preview.lqh2011.com`) needs the same API env vars, otherwise
   login fails there:
   - `DATABASE_URL` — the Neon pooled connection string
   - `AUTH_PASSWORD_HASH` — from `npm run hash` (format `scrypt$<salt>$<hash>`)
   - `AUTH_TOKEN_SECRET` — the random hex
   - `ALLOWED_ORIGIN` — optional, comma-separated list of origins allowed to
     call the API; defaults to `https://start.lqh2011.com`. Set it in **both**
     environments and keep the preview alias in the value:
     `https://start.lqh2011.com,https://preview.lqh2011.com`
   - **AI chat** (only needed for the built-in chat feature) — an
     OpenAI-compatible provider proxied server-side, so the key never reaches
     the browser:
     - `AI_BASE_URL` — e.g. `https://api.deepseek.com/v1` (no trailing slash)
     - `AI_MODEL` — e.g. `deepseek-chat`
     - `AI_API_KEY` — the provider API key
3. Deploy; the API lives at `https://<your-project>.vercel.app/api/…`.

### 4. DNS (one domain)

The page and API share one origin, so only **one** record is needed: point
`start.lqh2011.com` at Vercel — `start.lqh2011.com` CNAME → `cname.vercel-dns.com`.
Vercel provisions the TLS certificate automatically. No `start-api` subdomain
is required anymore.

### 5. Preview alias (preview.lqh2011.com)

PR previews deploy to `*.vercel.app`, which is blocked in China. A GitHub
Actions workflow (`.github/workflows/vercel-preview-alias.yml`) re-points
`preview.lqh2011.com` at every successful Vercel preview build, so any PR can
be previewed from China at https://preview.lqh2011.com.

Setup once:

1. Vercel → project → **Settings → Domains** → Add `preview.lqh2011.com`.
2. DNS provider: `preview` CNAME → `cname.vercel-dns.com` (same target as
   `start.lqh2011.com`).
3. Vercel → **Account Settings → Tokens** (https://vercel.com/account/tokens)
   → Create Token → scope **Full Account**. This must be a *classic personal*
   token: team- or project-scoped tokens have no user identity, and the
   workflow fails with `Not able to load user ... User not found (404)`.
4. GitHub → repo → **Settings → Secrets and variables → Actions** → New
   repository secret → name `VERCEL_TOKEN`, paste the token.

How it works: the workflow triggers on PR events (`opened`, `synchronize`,
`reopened`) — one run per push, never on production deploys — and polls
GitHub's deployments API until the Vercel preview build for that PR's head
commit is ready, then runs `vercel alias <preview-url> preview.lqh2011.com`.
The alias is single and last-wins — the most recently deployed PR owns it.
Runs serialize in one concurrency group (`cancel-in-progress: false`); GitHub
keeps only the newest pending run per group, so under a burst of pushes older
queued runs are cancelled and the newest event's run aliases last. Build
failures and wait timeouts exit cleanly
(no red X on the PR) and the next push retries. The workflow also posts (and
keeps updating) one comment per PR showing whether the aliasing succeeded —
including when a PR is opened after its preview was already built (the
`opened` event finds the ready build immediately).

### Local development

```sh
cp .env.example .env    # fill DATABASE_URL, AUTH_PASSWORD_HASH, AUTH_TOKEN_SECRET,
                        # and (for chat) AI_BASE_URL, AI_MODEL, AI_API_KEY
npm install
npm run dev             # http://127.0.0.1:8787 — page + API, one origin, real Postgres
```

> **Note:** the AI chat endpoints check authentication **before** the origin
> check, so for an **authenticated** request a non-allowlisted origin gets
> `403 origin_not_allowed` (an unauthenticated request from any origin gets
> `401` first). To exercise chat in local `npm run dev`, include the local
> origin in `ALLOWED_ORIGIN` in `.env`, e.g.
> `ALLOWED_ORIGIN=http://127.0.0.1:8787`.

### How it fits together

```text
browser (any device)             Vercel (one project · one origin)      Neon
  start.lqh2011.com                     /api/auth  (password → token)   kv table
  index.html (static)  ──HTTPS──▶       /api/data  (GET/POST kv)   ──▶  Postgres
  localStorage + token     same-origin  /api/chat  (streams AI reply,        chat_sessions
                                        proxies AI_BASE_URL)                chat_messages
                                        /api/chat-sessions
                                        /api/chat-messages
```
Auth: one password, verified with scrypt against `AUTH_PASSWORD_HASH`; successful
login returns an HMAC-signed token (90-day expiry) stored per device. Failed logins
are rate-limited per IP (10 per 15 min) — but a correct password is never blocked.
The page and API share an origin, so no CORS is needed on the normal path; the API
still echoes allowed origins (safety net) and answers OPTIONS preflights.
