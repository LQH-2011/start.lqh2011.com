# start.lqh2011.com

Personal browser start page — minimalist, in the same style as the blog.

## Structure

- `index.html` — single self-contained page (inline CSS, no dependencies):
  - **Logo**: "LQH-2011" as 5×7 pixel-block glyphs (SVG `<use>` + `<rect>`), with a
    checkerboard-patterned block shadow offset down-right.
  - **Search**: submits to `https://cn.bing.com/search?q=…` (change in the `<form action>`).
  - **Bookmarks**: edit the `<nav class="links">` list.

## Editing the logo

Glyph maps live in the 5×7 grid definitions inside the `<svg>` `<defs>`; each glyph is a
group of `<rect>` blocks. The shadow pattern is the `#shadow` `<pattern>` (checkerboard).
The page was generated from `/tmp/gen_start.py` (pixel-font maps → SVG) — ask the assistant
to regenerate if you want bigger cells, different glyphs, or a different shadow pattern.

## Deploy

Static site; push to `main` and GitHub Pages serves it at https://start.lqh2011.com.
