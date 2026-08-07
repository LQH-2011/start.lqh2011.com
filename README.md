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
    prepended); type `aaa` (or `/`) to enter command mode. When the
    bar is not focused, global shortcuts still work (`a`, `/`, `s`, `c`, `k` —
    see Features).
  - **Bookmarks**: edit the `<nav class="links">` list.

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
- **Command mode**: type `aaa` (or `Aaa` / `/`, case-insensitive) in the bar to
  enter command mode (the indicator swaps to a `❯` on the left; the input stays
  left-aligned). Then (letters are case-insensitive):
  - `a` — **Abrir**: back to the URL opener (selected top mode, persisted)
  - `b` — **Buscar**: back to the search bar (selected top mode, persisted)
  - `c` — toggle the "LQH-2011" logo and a live HH:MM:SS block-art clock (stays in
    command mode)
  - `k` — toggle light/dark theme (stays in command mode)
  - `r` — refresh the page (stays in command mode)
  - `s` — **Settings**: open the settings mode (gear indicator)
  - `t` — **Timer**: set a countdown (timer indicator; type the duration, Enter
    starts it)
  - `u` — start a count-up from `00:00` (stays in command mode)
  - `h` — toggle hours (`MM:SS` ↔ `HH:MM:SS`) for the active timer (stays in
    command mode)
  - `x` — stop the timer and restore the logo (or the clock if it was on)
    (stays in command mode)
  Any other character exits command mode and keeps the text as-is in the selected top
  mode; Enter or Backspace (on an empty prompt) in command mode returns to the top.
- **Settings mode**: `s` from command mode opens it (gear indicator). Then
  (case-insensitive):
  - `b` — Bing (default)
  - `g` — Google (`https://www.google.com/search`)
  - `d` — DeepSeek chat (`https://chat.deepseek.com/?q=…`)
  - `w` — Wikipedia (`https://en.wikipedia.org/w/index.php`, `name="search"`)
  - `c` / `k` — same toggles as in command mode (stay in settings)
  - `r` — refresh the page (stays in settings)
  Engine keys exit settings back to the search bar with the new engine, and make
  the search bar the selected top mode (so backspace/Enter return to it). Backspace
  on an empty prompt goes one layer up (settings → command); Enter returns straight
  to the top. The engine choice is saved in `localStorage` (`start.engine`) and
  restored on load.
- **Global shortcuts (bar not focused)**: after clicking a bookmark link (or anywhere
  else), the bar loses focus — these page-level keys still work:
  - `a` — refocus the url/search bar, keeping the current top mode
  - `/` — enter command mode directly
  - `s` — open settings mode directly
  - `c` — toggle the block-art clock (focus stays where it is)
  - `k` — toggle light/dark theme (focus stays where it is)
  Modifier combos (`Ctrl+…`, `Cmd+…`, `Alt+…`) are never intercepted. While any
  editable element is focused (the bar, a textarea, `contenteditable`) these keys
  type into it normally (in-bar `/` still enters command mode).
- **Pinned-link keys (`1`–`6`)**: press a digit to open the matching bookmark in a
  new tab — `1` is the first link in the bookmarks list, `6` the last. They work
  in two situations only: when the bar is **not** focused, and while the bar is
  focused in **command** mode (`aaa` or `/`). In url/search/settings mode the
  digits type into the bar normally (so URLs like `1.1.1.1` still work).
  Modifier combos (`Ctrl+1` / `Cmd+1` tab switching, etc.) and held-key repeats
  are never hijacked.
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
  the timer and restores the logo (or the block-art clock if it was on). In timer mode,
  digits and colons type the value, Enter starts the countdown, Backspace on an empty
  prompt returns to command mode, and any other character exits keeping the text. The
  timer survives reloads: its state (absolute end/start timestamps plus the hours
  display) is saved in `localStorage` under `start.timer`, so a countdown resumes with
  the correct remaining time, a count-up keeps counting, and a finished countdown stays
  at `00:00`. Stopping it with `x` (or `c`) clears the saved state.

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
- `start.engine` — `bing`, `google`, `deepseek`, `wikipedia`; restored on load.
- `start.theme` — `light` or `dark`; restored on load.
- `start.clock` — `on` or `off`; restored on load (clock shown when `on`).

## Deploy

Static site; push to `main` and GitHub Pages serves it at https://start.lqh2011.com.
