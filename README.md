# start.lqh2011.com

Personal browser start page — minimalist, in the same style as the blog.

## Structure

- `index.html` — single self-contained page (inline CSS, no dependencies):
  - **Logo**: "LQH-2011" as 5×7 pixel-block glyphs (SVG `<use>` + `<rect>`), with a
    checkerboard-patterned block shadow offset down-right. Doubles as a live
    HH:MM:SS block-art clock via the `c` command (see Features).
  - **Bar**: the input doubles as a URL opener (default) and a search bar.
    Type a URL and press Enter to open it in a new tab (a bare domain gets
    `https://` prepended); type `aaa` (or `/`) to enter command mode.
  - **Bookmarks**: edit the `<nav class="links">` list.

## Features

- **Dark mode**: type `aaa` then `k` in the search bar to toggle light/dark. There is no
  visual switcher and no OS `prefers-color-scheme` detection; the choice is saved in
  `localStorage` (`start.theme`) and restored on the next load. The block logo and its
  shadow adapt via CSS variables.
- **URL opener (default)**: the bar starts in URL mode (globe indicator). Type a URL and
  press Enter to open it in a new tab — a bare domain (`example.com`) gets `https://`
  prepended automatically, URLs with a scheme (`https://…`, `mailto:…`) open as-is.
- **Command mode**: type `aaa` (or `Aaa` / `/`, case-insensitive) in the bar to
  enter command mode (the indicator swaps to a `❯` on the left; the input stays
  left-aligned). Then (letters are case-insensitive):
  - `a` — **Abrir**: back to the URL opener (selected top mode, persisted)
  - `b` — **Buscar**: back to the search bar (selected top mode, persisted)
  - `c` — toggle the "LQH-2011" logo and a live HH:MM:SS block-art clock (stays in
    command mode)
  - `k` — toggle light/dark theme (stays in command mode)
  - `s` — **Settings**: open the settings mode (gear indicator)
  Any other character exits command mode and keeps the text as-is in the selected top
  mode; Enter or Backspace (on an empty prompt) in command mode returns to the top.
- **Settings mode**: `s` from command mode opens it (gear indicator). Then
  (case-insensitive):
  - `b` — Bing (default)
  - `g` — Google (`https://www.google.com/search`)
  - `d` — DeepSeek chat (`https://chat.deepseek.com/?q=…`)
  - `w` — Wikipedia (`https://en.wikipedia.org/w/index.php`, `name="search"`)
  - `c` / `k` — same toggles as in command mode (stay in settings)
  Engine keys exit settings back to the search bar with the new engine, and make
  the search bar the selected top mode (so backspace/Enter return to it). Backspace
  on an empty prompt goes one layer up (settings → command); Enter returns straight
  to the top. The engine choice is saved in `localStorage` (`start.engine`) and
  restored on load.
- **Block-art clock**: type `aaa` then `c` in the search bar to swap the logo for a live
  clock in the same 5×7 pixel-block style (digits and colon are glyphs in the same SVG
  `<defs>`; the seconds tick every 1000 ms). Press `c` again to switch back. The choice
  is saved in `localStorage` (`start.clock`, `on`/`off`) and restored on the next load.

## Editing the logo

Glyph maps live in the 5×7 grid definitions inside the `<svg>` `<defs>`; each glyph is a
group of `<rect>` blocks. The shadow pattern is the `#shadow` `<pattern>` (checkerboard).
The page was generated from the `gen_block_logo.py` script in the
`static-html-artifacts` skill (pixel-font maps → SVG) — ask the assistant
to regenerate if you want bigger cells, different glyphs, or a different shadow pattern.

## Persistence (localStorage)

- `start.mode` — `url` or `search`; the selected top mode, restored on load
  (invalid values → url, the default).
- `start.engine` — `bing`, `google`, `deepseek`, `wikipedia`; restored on load.
- `start.theme` — `light` or `dark`; restored on load.
- `start.clock` — `on` or `off`; restored on load (clock shown when `on`).

## Deploy

Static site; push to `main` and GitHub Pages serves it at https://start.lqh2011.com.
