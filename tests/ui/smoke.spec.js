/* UI smoke tests for start.lqh2011.com — drives the mode state machine,
   the URL history dropdown, the timer, bookmarks and the auth gate, all in a
   headless Chromium against a static server (no real sync API: the page's
   /api/data fetch 404s and it falls back to the local-first path).

   State is seeded BEFORE the page scripts run (addInitScript): a fake token
   (so the auth overlay stays hidden), bookmarks + history (so the data-driven
   UI has something to render), and a window.open stub (so no real tabs open).
   Each test gets a fresh browser context = fresh localStorage. */
'use strict';

const { test, expect } = require('@playwright/test');

/* Seed + stub. Runs before every page script on every navigation (including
   the `r`-reload handshake, where the re-seeded token keeps the overlay
   hidden). */
const SEED = () => {
  localStorage.setItem('start.token', 'ci-fake-token');
  localStorage.setItem('start.bookmarks', JSON.stringify([
    { label: 'github', url: 'https://github.com' },
    { label: 'rae', url: 'https://www.rae.es/diccionario-estudiante' }
  ]));
  localStorage.setItem('start.history', JSON.stringify([
    'https://github.com/lqh-2011',
    'https://www.google.com',
    'https://example.org/docs'
  ]));
  window.__opened = [];
  window.open = function (url) { window.__opened.push(url); return null; };
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript(SEED);
});

/* Drive the bar's input handler the way the skill's verified probe does:
   focus the input (real-user behavior — the dropdown only shows while the
   bar is focused), set the value, dispatch a bubbling input event. Mode keys
   (aaa, t, s, ...) are evaluated by the page's own input listener. */
async function typeInBar(page, text) {
  await page.locator('#q').focus();
  await page.evaluate((t) => {
    const input = document.getElementById('q');
    input.value = t;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

async function placeholder(page) {
  return page.locator('#q').getAttribute('placeholder');
}

async function opened(page) {
  return page.evaluate(() => window.__opened);
}

async function logoLabel(page) {
  return page.locator('#logo').getAttribute('aria-label');
}

/* ---------- load / default state ---------- */

test('loads logged-in in default url mode with seeded bookmarks', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#authOverlay')).toBeHidden();
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(false);

  await expect(page.locator('#urlIcon')).toBeVisible();
  await expect(page.locator('#searchIcon')).toBeHidden();
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Abrir URL…');
  await expect(page.locator('.search')).toHaveAttribute('action', 'https://cn.bing.com/search');
  await expect(page.locator('.links a')).toHaveCount(2);
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', 'LQH-2011');
});

/* ---------- command mode / theme ---------- */

test('aaa enters command mode; k toggles theme and stays in command mode', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await expect(page.locator('#cmdIndicator')).toBeVisible();
  await expect(page.locator('#urlIcon')).toBeHidden();
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');

  await typeInBar(page, 'k');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('start.theme'))).toBe('dark');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');

  await typeInBar(page, 'k');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

/* ---------- theme: system detection + device-specific pref ---------- */

/* Fresh context with a given OS color scheme, seeded like the default
   context (fake token + bookmarks + history + window.open stub), plus an
   optional extra localStorage seed. Each context = a fresh device. */
async function themedPage(browser, colorScheme, extraSeed) {
  const context = await browser.newContext({
    colorScheme,
    baseURL: 'http://127.0.0.1:8123'
  });
  await context.addInitScript(SEED);
  if (extraSeed) { await context.addInitScript(extraSeed); }
  const page = await context.newPage();
  await page.goto('/');
  return { context, page };
}

async function theme(page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
}

test('no pinned pref follows the OS: light OS -> light, dark OS -> dark', async ({ browser }) => {
  const light = await themedPage(browser, 'light');
  expect(await theme(light.page)).toBe('light');
  expect(await light.page.evaluate(() => localStorage.getItem('start.theme'))).toBeNull();
  await light.context.close();

  const dark = await themedPage(browser, 'dark');
  expect(await theme(dark.page)).toBe('dark');
  /* following the system never writes a pref — a fresh load stays 'sys' */
  expect(await dark.page.evaluate(() => localStorage.getItem('start.theme'))).toBeNull();
  await dark.context.close();
});

test('CSS-only fallback: with JS disabled, a dark OS still renders dark', async ({ browser }) => {
  /* No inline script runs, so html keeps no data-theme — the @media
     (prefers-color-scheme: dark) html:not([data-theme]) rule must carry
     the dark palette before/without JS. */
  const context = await browser.newContext({
    colorScheme: 'dark',
    javaScriptEnabled: false,
    baseURL: 'http://127.0.0.1:8123'
  });
  const page = await context.newPage();
  await page.goto('/');
  /* hasAttribute, not an attribute-value regex: an empty data-theme=""
     must also count as present, so only a true absence proves the
     no-JS path left the attribute unset */
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
  await context.close();
});

test('sys follows OS switches live; an explicit choice ignores them', async ({ browser }) => {
  /* sys (no pref): live OS switches re-theme the page */
  const s = await themedPage(browser, 'light');
  await s.page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(s.page)).toBe('dark');
  await s.page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(s.page)).toBe('light');
  await s.context.close();

  /* explicit light pinned on a dark OS: OS switches must not move it */
  const e = await themedPage(browser, 'dark',
    () => localStorage.setItem('start.theme', 'light'));
  expect(await theme(e.page)).toBe('light');
  await e.page.emulateMedia({ colorScheme: 'light' });
  await e.page.waitForTimeout(100);
  expect(await theme(e.page)).toBe('light');
  await e.page.emulateMedia({ colorScheme: 'dark' });
  await e.page.waitForTimeout(100);
  expect(await theme(e.page)).toBe('light');
  await e.context.close();
});

test('k from the system default pins the opposite explicit choice', async ({ browser }) => {
  const { context, page } = await themedPage(browser, 'dark');
  expect(await theme(page)).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('start.theme'))).toBeNull();

  await typeInBar(page, 'aaa');
  await typeInBar(page, 'k');
  expect(await theme(page)).toBe('light');
  expect(await page.evaluate(() => localStorage.getItem('start.theme'))).toBe('light');

  /* the pinned choice survives later OS switches */
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  expect(await theme(page)).toBe('light');
  await context.close();
});

test('k cycles back to system mode and live OS switching resumes', async ({ browser }) => {
  /* dark OS, no pref: sys -> k pins light -> k pins dark -> k returns to sys.
     A pinned choice that matches the OS returns to auto; one that differs
     flips to the other explicit choice. */
  const d = await themedPage(browser, 'dark');
  expect(await theme(d.page)).toBe('dark');
  await typeInBar(d.page, 'aaa');
  await typeInBar(d.page, 'k');
  expect(await theme(d.page)).toBe('light');                       /* sys -> pinned light */
  expect(await d.page.evaluate(() => localStorage.getItem('start.theme'))).toBe('light');
  await typeInBar(d.page, 'k');
  expect(await theme(d.page)).toBe('dark');                        /* pinned light -> pinned dark */
  expect(await d.page.evaluate(() => localStorage.getItem('start.theme'))).toBe('dark');
  await typeInBar(d.page, 'k');
  expect(await theme(d.page)).toBe('dark');                        /* pinned dark == dark OS -> sys */
  expect(await d.page.evaluate(() => localStorage.getItem('start.theme'))).toBe('sys');

  /* sys again: live OS switches re-theme the page */
  await d.page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(d.page)).toBe('light');
  await d.page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(d.page)).toBe('dark');
  await d.context.close();

  /* light OS: sys -> dark -> light(pin, matches OS) -> sys */
  const l = await themedPage(browser, 'light');
  expect(await theme(l.page)).toBe('light');
  await typeInBar(l.page, 'aaa');
  await typeInBar(l.page, 'k');
  expect(await theme(l.page)).toBe('dark');                        /* sys -> pinned dark */
  await typeInBar(l.page, 'k');
  expect(await theme(l.page)).toBe('light');                       /* pinned dark -> pinned light */
  await typeInBar(l.page, 'k');
  expect(await theme(l.page)).toBe('light');                       /* pinned light == light OS -> sys */
  expect(await l.page.evaluate(() => localStorage.getItem('start.theme'))).toBe('sys');
  await l.page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(l.page)).toBe('dark');
  await l.context.close();
});

/* ---------- settings / engines ---------- */

test('settings mode switches engines and lands in search mode', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await expect(page.locator('#settingsIcon')).toBeVisible();
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Ajustes…');

  await typeInBar(page, 'g');
  await expect(page.locator('.search')).toHaveAttribute('action', 'https://www.google.com/search');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Buscar en Google…');
  await expect(page.locator('#searchIcon')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('start.engine'))).toBe('google');

  /* from search mode: / then s then f -> Jacky Forum */
  await typeInBar(page, '/');
  await expect(page.locator('#cmdIndicator')).toBeVisible();
  await typeInBar(page, 's');
  await typeInBar(page, 'f');
  await expect(page.locator('.search')).toHaveAttribute('action', 'https://f.m14ga.org/');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Buscar en Jacky Forum…');
});

test('settings mode: e selects the RAE Diccionario del Estudiante and submits a path URL', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 'e');
  await expect(page.locator('.search')).toHaveAttribute('action', 'https://www.rae.es/diccionario-estudiante/');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Buscar en Diccionario del Estudiante…');
  expect(await page.evaluate(() => localStorage.getItem('start.engine'))).toBe('rae');

  /* search mode now: the RAE query goes in the URL path, not a query string —
     the submit handler builds it manually and opens it in a new tab; the
     query includes spaces, Unicode and a reserved path character so the
     percent-encoding is actually exercised */
  await typeInBar(page, 'casa de niño/qué?');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual([
    'https://www.rae.es/diccionario-estudiante/casa%20de%20ni%C3%B1o%2Fqu%C3%A9%3F'
  ]);
  await expect(page.locator('#q')).toHaveJSProperty('value', '');
});

test('settings mode: x arms logout (moved from e)', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Cerrar sesión? (s/n)');

  /* Escape cancels back to settings */
  await page.locator('#q').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Ajustes…');

  /* and e is no longer logout: it picks the RAE engine instead */
  await typeInBar(page, 'e');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Buscar en Diccionario del Estudiante…');
});

/* ---------- url opener ---------- */

test('url mode opens normalized URLs, records history, rejects dangerous schemes', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'example.com');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.com']);
  await expect(page.locator('#q')).toHaveJSProperty('value', '');

  /* recorded as the newest history entry */
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('start.history')));
  expect(history[0]).toBe('https://example.com');

  /* host:port gets https:// too */
  await typeInBar(page, 'localhost:3000');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.com', 'https://localhost:3000']);

  /* javascript: is rejected: nothing opens, input keeps the text */
  await typeInBar(page, 'javascript:alert(1)');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.com', 'https://localhost:3000']);
  await expect(page.locator('#q')).toHaveJSProperty('value', 'javascript:alert(1)');
});

/* ---------- history dropdown ---------- */

test('history dropdown: "Abrir este URL…" first, arrows navigate, Enter opens the highlighted row', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'git');
  await expect(page.locator('#urlHistory')).toBeVisible();
  /* row 0 is the action row; the matching history entry follows */
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(2);
  await expect(page.locator('#urlHistory .url-history-item').first()).toHaveText('Abrir este URL…');
  await expect(page.locator('#urlHistory .url-history-item').nth(1)).toHaveText('github.com/lqh-2011');

  await page.keyboard.press('Escape');
  await expect(page.locator('#urlHistory')).toBeHidden();

  /* ArrowDown moves the highlight onto the history entry; Enter opens it */
  await typeInBar(page, 'git');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://github.com/lqh-2011']);
  await expect(page.locator('#q')).toHaveJSProperty('value', '');
  await expect(page.locator('#urlHistory')).toBeHidden();
});

test('bug: a typed URL that is a substring of an older entry still opens on Enter', async ({ page }) => {
  await page.goto('/');

  /* Seed history has https://example.org/docs — typing the bare domain
     matches that older entry, but Enter must open the TYPED url */
  await typeInBar(page, 'example.org');
  await expect(page.locator('#urlHistory')).toBeVisible();
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(2);
  await expect(page.locator('#urlHistory .url-history-item').nth(1)).toHaveText('example.org/docs');

  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.org']);
  await expect(page.locator('#q')).toHaveJSProperty('value', '');
  await expect(page.locator('#urlHistory')).toBeHidden();
});

test('d deletes the highlighted history entry and re-renders the dropdown', async ({ page }) => {
  await page.goto('/');

  /* add a second entry so one match remains after the delete */
  await typeInBar(page, 'example.org/extra');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.org/extra']);

  await typeInBar(page, 'example.org');
  await expect(page.locator('#urlHistory')).toBeVisible();
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(3);   /* action + 2 matches */
  await expect(page.locator('#urlHistory .url-history-item').nth(1)).toHaveText('example.org/extra');
  await expect(page.locator('#urlHistory .url-history-item').nth(2)).toHaveText('example.org/docs');

  await page.keyboard.press('ArrowDown');   /* highlight example.org/extra (newest first) */
  await page.keyboard.press('d');
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(2);
  await expect(page.locator('#urlHistory .url-history-item').nth(1)).toHaveText('example.org/docs');

  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('start.history')));
  expect(history).not.toContain('https://example.org/extra');
  expect(history).toContain('https://example.org/docs');
  /* nothing re-opened, the bar keeps the typed text */
  expect(await opened(page)).toEqual(['https://example.org/extra']);
  await expect(page.locator('#q')).toHaveJSProperty('value', 'example.org');
});

test('modified d (Ctrl+D) does not delete the highlighted history entry', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'git');
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');   /* highlight github.com/lqh-2011 */
  await page.keyboard.press('Control+d');   /* browser bookmark shortcut */

  /* the entry survives and the dropdown is untouched */
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('start.history')));
  expect(history).toContain('https://github.com/lqh-2011');
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(2);
  await expect(page.locator('#urlHistory .url-history-item').nth(1)).toHaveText('github.com/lqh-2011');
  expect(await opened(page)).toEqual([]);
});

test('history dropdown never opens in search mode', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 'b');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Buscar en Bing…');

  await typeInBar(page, 'git');
  await expect(page.locator('#urlHistory')).toBeHidden();
});

/* ---------- timer ---------- */

test('timer: countdown starts, stops with x, count-up runs', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Temporizador');

  /* invalid input exits timer mode back to the top */
  await typeInBar(page, 'abc');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Abrir URL…');

  /* valid countdown: 25 -> 25 minutes, display replaces the logo */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await typeInBar(page, '25');
  await page.keyboard.press('Enter');
  await expect.poll(() => logoLabel(page)).toMatch(/^\d{2}:\d{2}$/);
  const timer = await page.evaluate(() => JSON.parse(localStorage.getItem('start.timer')));
  expect(timer.kind).toBe('down');
  expect(timer.end).toBeGreaterThan(Date.now());

  /* x stops it: logo back, storage cleared (countdown commit exited to url,
     so re-enter command mode first) */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 'x');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', 'LQH-2011');
  expect(await page.evaluate(() => localStorage.getItem('start.timer'))).toBeNull();

  /* count-up from 00:00 — x left us in command mode, so u works directly */
  await typeInBar(page, 'u');
  await expect.poll(() => logoLabel(page)).toMatch(/^\d{2}:\d{2}$/);
  await page.waitForTimeout(1500);
  expect(await logoLabel(page)).not.toBe('00:00');
  await typeInBar(page, 'x');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', 'LQH-2011');
});

test('timer: finished countdown flashes, flips to count-up, then settles', async ({ page }) => {
  await page.goto('/');

  /* 1-second countdown (0:01) so the elapse happens fast */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await typeInBar(page, '0:01');
  await page.keyboard.press('Enter');
  const end = (await page.evaluate(() => JSON.parse(localStorage.getItem('start.timer')))).end;
  expect(end).toBeGreaterThan(Date.now());

  /* after the elapse: the record flipped to a count-up anchored at the end
     time and the logo is flashing */
  await page.waitForTimeout(1600);
  const flipped = await page.evaluate(() => JSON.parse(localStorage.getItem('start.timer')));
  expect(flipped.kind).toBe('up');
  expect(flipped.start).toBe(end);
  expect(await page.evaluate(
    () => document.getElementById('logo').classList.contains('timer-flash')
  )).toBe(true);

  /* count-up advances past 00:00 */
  await expect.poll(() => logoLabel(page)).not.toBe('00:00');

  /* flash window ends; the count-up is still running */
  await expect.poll(
    () => page.evaluate(() => document.getElementById('logo').classList.contains('timer-flash')),
    { timeout: 7000 }
  ).toBe(false);
  const settled = await logoLabel(page);
  await page.waitForTimeout(1200);
  expect(await logoLabel(page)).not.toBe(settled);

  /* x stops it: logo back, storage cleared */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 'x');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', 'LQH-2011');
  expect(await page.evaluate(() => localStorage.getItem('start.timer'))).toBeNull();
});

/* ---------- mode stack ---------- */

test('backspace on empty bar climbs links -> settings -> command -> top', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 'l');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Favoritos…');

  await page.locator('#q').focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Ajustes…');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Abrir URL…');
});

test('escape climbs the stack: settings -> command -> top', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, '-');
  await typeInBar(page, 's');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Ajustes…');

  await page.locator('#q').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
  await page.keyboard.press('Escape');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Abrir URL…');
});

/* ---------- bookmarks ---------- */

test('bookmark add flow: links -> a -> url -> label -> rendered', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 'l');
  await typeInBar(page, 'a');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'URL del favorito…');

  await typeInBar(page, 'https://news.ycombinator.com');
  await page.keyboard.press('Enter');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Nombre (Enter = la URL)…');
  await page.keyboard.press('Enter');

  await expect(page.locator('.links a')).toHaveCount(3);
  await expect(page.locator('.links a').nth(2)).toHaveText('https://news.ycombinator.com');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('start.bookmarks')));
  expect(saved).toHaveLength(3);
  expect(saved[2].url).toBe('https://news.ycombinator.com');
});

test('bookmark delete flow: links -> x -> 1 -> s', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.links a')).toHaveCount(2);

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 'l');
  await typeInBar(page, 'x');
  await typeInBar(page, '1');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');

  await expect(page.locator('.links a')).toHaveCount(1);
  await expect(page.locator('.links a').first()).toHaveText('rae');
});

/* ---------- global shortcuts / pinned keys ---------- */

test('digit keys open pinned links when the bar is not focused and in command mode', async ({ page }) => {
  await page.goto('/');

  /* bar not focused: document-level shortcut */
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('1');
  expect(await opened(page)).toEqual(['https://github.com']);

  /* command mode with the bar focused: 1 opens the first bookmark too */
  await page.locator('#q').focus();
  await typeInBar(page, 'aaa');
  await page.keyboard.press('1');
  expect(await opened(page)).toEqual(['https://github.com', 'https://github.com']);
});

/* ---------- reload handshake (regression: submode restore + listeners) ---------- */

test('r reloads into command mode and the page stays interactive', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  const loaded = page.waitForEvent('load');
  await typeInBar(page, 'r').catch(() => { /* reload may race the evaluate */ });
  await loaded;

  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
  /* listeners must be registered after the restored-submode load */
  await typeInBar(page, 'a');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Abrir URL…');
});

/* ---------- p command with the API down ---------- */

test('p pull with the API unreachable is a no-op, page stays interactive', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 'p');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
  await typeInBar(page, 'a');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Abrir URL…');
});

/* ---------- auth gate (no token) ---------- */

test('auth overlay gates the page without a token', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');

  await expect(page.locator('#authOverlay')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(true);

  /* API is down (static server 404s /api/auth): wrong password still gets a
     deterministic error through the form's error path */
  await page.locator('#authPassword').fill('wrong-password');
  await page.locator('.auth-submit').click();
  await expect(page.locator('#authError')).toHaveText('Contraseña incorrecta.');

  await ctx.close();
});
