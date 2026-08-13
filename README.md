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

- **Dark mode**: type `aaa` then `k` in the search bar to toggle light/dark. There is no
  visual switcher and no OS `prefers-color-scheme` detection; the choice is saved in
  `localStorage` (`start.theme`) and restored on the next load. The block logo and its
  shadow adapt via CSS variables.
- **URL opener (default)**: the bar starts in URL mode (globe indicator). Type a URL and
  press Enter to open it in a new tab — a bare domain (`example.com`) or a host:port
  (`localhost:3000`, `example.com:8080`) gets `https://` prepended automatically, URLs
  with an allowed scheme (`https://…`, `mailto:…`, `tel:…`) open as-is, and any other
  scheme (`javascript:`, `data:`, …) is rejected.
- **URL history**: the opener records the 20 most recent URLs (`start.history`) —
  **kept on this device only, never synced** (raw URLs can carry private tokens or
  identifiers, so they don't go to the sync server). While the bar has text in url
  mode, a dropdown the same width as the bar lists the entries matching what you've
  typed (case-insensitive substring, scheme ignored — `git` finds `github.com`), most
  recent first, with the first match highlighted. `↑`/`↓` move the highlight
  (wrapping), **Enter** (or a click) opens the highlighted entry, `Esc` or clicking
  away closes the menu, and it never appears with an empty bar or in search mode. The
  combobox is exposed to screen readers (`aria-controls`/`aria-expanded`/
  `aria-activedescendant`).
- **Command mode**: type `aaa` (or `Aaa` / `/` / `-`, case-insensitive) in the bar to
  enter command mode (the indicator swaps to a `❯` on the left; the input stays
  left-aligned). Then (letters are case-insensitive):
  - `a` — **Abrir**: back to the URL opener (selected top mode, persisted)
  - `b` — **Buscar**: back to the search bar (selected top mode, persisted)
  - `c` — toggle the "LQH-2011" logo and a live HH:MM:SS block-art clock (stays in
    command mode)
  - `k` — toggle light/dark theme (stays in command mode)
  - `r` — refresh the page (stays in command mode)
  - `s` — **Settings**: open the settings mode (gear indicator); typing `/` or
    `-` again in command mode does the same
  - `t` — **Timer**: set a countdown (timer indicator; type the duration, Enter
    starts it); when a timer is already running, `t` brings its display back
    instead of setting a new one
  - `u` — start a count-up from `00:00` (stays in command mode)
  - `h` — toggle hours (`MM:SS` ↔ `HH:MM:SS`) for the active timer (stays in
    command mode)
  - `x` — stop the timer and restore the logo (or the clock if it was on)
    (stays in command mode)
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
  - `c` / `k` — same toggles as in command mode (stay in settings)
  - `l` — **Favoritos**: open the links/bookmarks submenu
  - `e` — **Cerrar sesión** (logout): type `s` (or `y`) and press **Enter**
    to wipe `localStorage` and `sessionStorage` — sync token, settings and
    bookmarks — and reload the page, so the password overlay returns; type
    any other response and press Enter, or press Escape or Backspace on an
    empty prompt, to cancel back to settings
  - `r` — refresh the page (stays in settings)
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
  - `c` / `k` / `r` — same toggles/refresh as in settings
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
  - `t` — show the running timer (focus stays where it is); with no timer, enter
    timer setup and focus the bar
  - `c` — toggle the block-art clock (focus stays where it is)
  - `k` — toggle light/dark theme (focus stays where it is)
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
- **Timer**: type `aaa` then `t` to set a **countdown** (the indicator swaps to a timer
  icon, the placeholder shows the accepted formats). Type the duration and press Enter —
  three formats are accepted: a plain integer is minutes (`25` = 25 min), `MM:SS`
  (`05:00`), or `HH:MM:SS` (`1:30:00`). A duration of one hour or more (`60`, `90`, or
  `90:00`) automatically converts to `HH:MM:SS` (`1:00:00` or `1:30:00`). Type `aaa` then `u` for a **count-up**
  that starts at `00:00`. The timer replaces the logo at the top in the same block-art
  style; it shows `MM:SS` by default and `HH:MM:SS` once the duration/elapsed time
  reaches one hour. `h` (in command mode) toggles the hours display manually; `x` stops
  the timer and restores the logo (or the block-art clock if it was on). **The timer
  keeps running in the background**: `c` while a timer is shown hides it and brings back
  the clock (or `c` again, the logo) without stopping it, and `t` (in command mode or
  the global shortcut) brings it back — a hidden countdown keeps the correct remaining
  time, so switching to the clock or logo and coming back resumes right where it was.
  In timer mode, digits and colons type the value, Enter starts the countdown,
  Backspace on an empty prompt returns to command mode, and any other character exits
  keeping the text. The timer survives reloads: its state (absolute end/start
  timestamps, the hours display, and whether it was on display) is saved in
  `localStorage` under `start.timer`, so a countdown resumes with the correct remaining
  time, a count-up keeps counting, a finished countdown stays at `00:00`, and a hidden
  timer reloads back into the clock/logo view. Stopping it with `x` clears the saved
  state.

## Sync (cross-device settings)

Since the settings sync backend landed, the page is **local-first**: it renders
instantly from `localStorage` exactly as before, and syncs to a small API + database
in the background. On the first visit from a device you enter the page password once;
after that the device holds a token and behaves exactly as before.

- **One-time password gate**: with no token in `localStorage`, a minimal overlay
  (matching the page design) asks for the password. On success a signed token is
  stored (`start.token`, valid 90 days); on failure the overlay shows an error.
  To log out, press `e` in settings mode, type `s` (or `y`) and press Enter:
  the page wipes `localStorage` and `sessionStorage` — token included — and
  reloads, so the overlay returns on that device (the synced data stays in
  the DB for the other devices). Any other response on Enter cancels.
- **Pull on load**: after auth, settings are pulled from the DB and merged into
  `localStorage` — **last-write-wins per key by timestamp** (each value carries an
  epoch-ms timestamp; a newer local value is never clobbered, and an older server
  value never overwrites a newer one). If anything changed the page reloads once so
  the restored state matches your other devices (unless you're already typing — then
  it applies on the next load).
- **Push on change**: every existing `save()` (mode, engine, theme, clock, timer —
  including stopping a timer, which syncs as a deletion) schedules a debounced POST
  to the API. Offline? The change stays local and is retried on the next change or
  load. Server-side last-write-wins protects against a stale offline device.
- **Timers sync too**: `start.timer` stores absolute end/start timestamps, so a
  countdown started on one device resumes on another with the correct remaining time.
- **What syncs**: `start.mode`, `start.engine`, `start.clock`, `start.theme`,
  `start.timer`, `start.bookmarks`. The sync bookkeeping itself lives in
  `localStorage` under `start.sync.ts` (per-key timestamps) and is never uploaded.
  `start.history` is deliberately NOT in this list — URL history stays on the device.
- **No visible chrome**: no status indicators were added — the page looks identical.
  Sync failures are silent (console) and self-healing.

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
- `start.engine` — `bing`, `google`, `deepseek`, `wikipedia`, `jackyforum`; restored on load.
- `start.theme` — `light` or `dark`; restored on load.
- `start.clock` — `on` or `off`; restored on load (clock shown when `on`).
- `start.timer` — the active timer: `{kind, end|start, hours, visible}` (absolute
  timestamps); restored on load; removed by `x`.
- `start.bookmarks` — the bookmark list: a JSON array of `{label, url}` objects,
  edited from settings → links; restored on load; first run defaults to the original
  hardcoded links.
- `start.history` — the URL-opener history: a JSON array of the 20 most recent
  normalized URLs (most recent first, deduped); restored on load; first run is empty.
  **Device-local only** — deliberately excluded from the settings sync (URLs can
  contain private identifiers/tokens), wiped by logout like everything else.
- `start.token` — the sync session token (set after the one-time password; drives
  the auth overlay and the API calls). It is sent to the API as a bearer token
  and is never included in the synchronized key/value payload.
- `start.sync.ts` — sync bookkeeping: a JSON map of key → epoch-ms timestamp
  (last-known write time per synced key). Used for last-write-wins merging; never
  uploaded itself.

## Deploy

The **frontend stays on GitHub Pages** (push to `main`, https://start.lqh2011.com —
unchanged). The **sync backend** is Vercel serverless functions + Neon Postgres at
https://start-api.lqh2011.com.

### 1. Neon (database)

1. Create a project at https://console.neon.tech (free tier is plenty — one table).
2. Copy the **pooled** connection string (Project Dashboard → Connect → Pooled,
   looks like `postgres://…-pooler…`). It contains the DB password.
3. Create the table — run `schema.sql` (one table, `kv`). Easiest: paste it into
   Neon's SQL editor; or `psql "$DATABASE_URL" -f schema.sql`.

### 2. Secrets (local)

```sh
npm install
npm run hash            # prints a random password + its AUTH_PASSWORD_HASH
openssl rand -hex 32    # -> AUTH_TOKEN_SECRET
```
Save the password somewhere safe — it's what you'll type on each new device.

### 3. Vercel (API)

1. Import this repo at https://vercel.com/new (Framework Preset: **Other**).
   Vercel auto-detects the `api/` directory and deploys `POST /api/auth` and
   `GET|POST /api/data` as serverless functions.
2. Add these Environment Variables to the project (Settings → Environment Variables):
   - `DATABASE_URL` — the Neon pooled connection string
   - `AUTH_PASSWORD_HASH` — from `npm run hash` (format `scrypt$<salt>$<hash>`)
   - `AUTH_TOKEN_SECRET` — the random hex
   - `ALLOWED_ORIGIN` — optional, defaults to `https://start.lqh2011.com`
3. Deploy; the API lives at `https://<your-project>.vercel.app/api/…`.

### 4. DNS (subdomain)

The main site's DNS does **not** move. In your DNS provider's panel add one record:
`start-api` CNAME → `cname.vercel-dns.com`.
Vercel provisions the TLS certificate automatically. The page already targets
`https://start-api.lqh2011.com`; no frontend change needed.

### Local development

```sh
cp .env.example .env    # fill DATABASE_URL, AUTH_PASSWORD_HASH, AUTH_TOKEN_SECRET
npm install
npm run dev             # http://127.0.0.1:8787 — page + API, one origin, real Postgres
```

### How it fits together

```text
browser (any device)                Vercel (serverless)         Neon
  start.lqh2011.com                   start-api.lqh2011.com      kv table
  index.html (GH Pages)    ──HTTPS──▶  /api/auth (password→token)
  localStorage + token     ◀──CORS───  /api/data (GET/POST kv)  ──▶ Postgres
```
Auth: one password, verified with scrypt against `AUTH_PASSWORD_HASH`; successful
login returns an HMAC-signed token (90-day expiry) stored per device. Failed logins
are rate-limited per IP (10 per 15 min) — but a correct password is never blocked.
The API sets CORS headers for `start.lqh2011.com` and answers OPTIONS preflights.
