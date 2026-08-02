# start.lqh2011.com

Personal browser start page — minimalist, in the same style as the blog.

## Structure

- `index.html` — single self-contained page (inline CSS, no dependencies):
  - **Logo**: "LQH-2011" as 5×7 pixel-block glyphs (SVG `<use>` + `<rect>`), with a
    checkerboard-patterned block shadow offset down-right.
  - **Search**: left-aligned input with a magnifier icon, submits to
    `https://cn.bing.com/search?q=…` (change in the `<form action>`) and opens the
    results in a new tab.
  - **Bookmarks**: edit the `<nav class="links">` list.

## Features

- **Dark mode**: type `aaa` then `k` in the search bar to toggle light/dark. There is no
  visual switcher and no OS `prefers-color-scheme` detection; the choice is saved in
  `localStorage` (`start.theme`) and restored on the next load. The block logo and its
  shadow adapt via CSS variables.
- **Command mode**: type `aaa` (or `Aaa`, case-insensitive) in the search bar to enter
  command mode (the magnifier icon is replaced by a `❯` indicator on the left; the
  input stays left-aligned). Then (letters are case-insensitive):
  - `b` — back to Bing (default)
  - `g` — Google
  - `d` — DeepSeek chat (`https://chat.deepseek.com/?q=…`)
  - `w` — Wikipedia
  - `k` — toggle light/dark mode (stays in command mode)
  Any other character exits command mode and keeps the text as a normal query; Enter or
  Backspace (on an empty prompt) in command mode cancels it. The engine choice is saved
  in `localStorage` (`start.engine`) and restored on the next load.

## Editing the logo

Glyph maps live in the 5×7 grid definitions inside the `<svg>` `<defs>`; each glyph is a
group of `<rect>` blocks. The shadow pattern is the `#shadow` `<pattern>` (checkerboard).
The page was generated from `/tmp/gen_start.py` (pixel-font maps → SVG) — ask the assistant
to regenerate if you want bigger cells, different glyphs, or a different shadow pattern.

## Deploy

Static site; push to `main` and GitHub Pages serves it at https://start.lqh2011.com.
