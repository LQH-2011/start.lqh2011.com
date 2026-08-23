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

async function timers(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('start.timers') || '[]'));
}
async function activeTimerId(page) {
  return page.evaluate(() => localStorage.getItem('start.timerActive'));
}

/* Build a running countdown / count-up record for seeding. */
function runningDown(id, name, dur) {
  return { id, name, kind: 'down', dur, end: Date.now() + dur * 1000, start: null, paused: null };
}
function idleDown(id, name, dur) {
  /* An idle countdown (no end/start) renders its configured duration
     deterministically (dur -> MM:SS) — used so the successor's displayed value
     is stable in tests instead of a racing live value. */
  return { id, name, kind: 'down', dur, end: null, start: null, paused: null };
}
function runningUp(id, name) {
  return { id, name, kind: 'up', dur: null, end: null, start: Date.now(), paused: null };
}
/* Persist a timer list (+ which timer owns the slot / its visibility) into
   localStorage, then reload so the page restores it — a deterministic way to
   seed state without driving the mode machine. */
async function seedTimers(page, timers, opts = {}) {
  await page.evaluate(({ t, active, visible }) => {
    localStorage.setItem('start.timers', JSON.stringify(t));
    if (active) localStorage.setItem('start.timerActive', active);
    if (visible !== undefined) localStorage.setItem('start.timerVisible', visible ? '1' : '0');
  }, { t: timers, active: opts.active, visible: opts.visible });
  await page.reload();
}
/* Climb the timers manager up one layer (timers -> settings -> command). */
async function backToCommand(page) {
  await page.locator('#q').focus();
  await page.keyboard.press('Backspace');   /* timers -> settings */
  await page.keyboard.press('Backspace');   /* settings -> command */
}
/* Add a named timer via the manager (command `t` -> `a` -> name -> kind -> dur).
   The new timer STARTS RUNNING the moment it is added (see tadd flow), so the
   flow ends in timers mode with the new timer highlighted AND running.
   `start` is accepted for backward compatibility with callers that pressed `y`
   — pressing it again just restarts the (already-running) timer. */
async function addTimer(page, { name = 'Temporizador', kind = 'down', dur = '25', start = false }) {
  await typeInBar(page, 't');       /* timers manager */
  await typeInBar(page, 'a');       /* add flow */
  await typeInBar(page, name);
  await page.keyboard.press('Enter');          /* commit name */
  await typeInBar(page, kind === 'up' ? 'u' : 'd');
  await page.keyboard.press('Enter');          /* commit kind */
  if (kind === 'down') {
    await typeInBar(page, dur);
    await page.keyboard.press('Enter');        /* commit duration */
  }
  if (start) { await typeInBar(page, 'y'); }   /* (re)start the highlighted timer */
  return timers(page);
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

/* ---------- command mode / fullscreen ---------- */

test('f toggles fullscreen and stays in command mode', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await expect(page.locator('#cmdIndicator')).toBeVisible();

  /* Real keyboard input (trusted events): the Fullscreen API requires
     transient user activation, which the synthetic input event from
     typeInBar() does not provide. */
  await page.keyboard.type('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');

  await page.keyboard.type('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
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

test('invalid URL in url mode does not open on Enter (garbage is blocked)', async ({ page }) => {
  await page.goto('/');

  /* a bare word with no dot is not a usable URL — Enter must NOT open https://hola */
  await typeInBar(page, 'hola');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual([]);
  await expect(page.locator('#q')).toHaveJSProperty('value', 'hola');

  /* whitespace is never a URL — Enter must NOT open https://foo bar */
  await typeInBar(page, 'foo bar');
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual([]);
  await expect(page.locator('#q')).toHaveJSProperty('value', 'foo bar');

  /* syntactically invalid DNS labels (labels that start/end with a hyphen, or
     empty labels) are not usable URLs — Enter must NOT open them */
  for (const bad of ['-.-', 'foo-.com', 'foo.-com', 'example..com']) {
    await typeInBar(page, bad);
    await page.keyboard.press('Enter');
    expect(await opened(page)).toEqual([]);
    await expect(page.locator('#q')).toHaveJSProperty('value', bad);
  }
});

test('valid URL with no matching history entry shows "Abrir este URL…" and Enter opens it', async ({ page }) => {
  await page.goto('/');

  /* example.com is a valid URL but matches none of the seeded history entries;
     the dropdown should still render the action row so the URL is openable. */
  await typeInBar(page, 'example.com');
  await expect(page.locator('#urlHistory')).toBeVisible();
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(1);
  await expect(page.locator('#urlHistory .url-history-item').first()).toHaveText('Abrir este URL…');

  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://example.com']);
  await expect(page.locator('#q')).toHaveJSProperty('value', '');
  await expect(page.locator('#urlHistory')).toBeHidden();
});

test('invalid (bare-label) input with a history match omits the "Abrir este URL…" row and opens the match', async ({ page }) => {
  await page.goto('/');

  /* "git" is not an openable URL (no dot), but it matches github.com/lqh-2011
     in the seeded history. No action row is rendered — the dropdown shows only
     the matching history entry, and Enter opens THAT, never https://git. */
  await typeInBar(page, 'git');
  await expect(page.locator('#urlHistory')).toBeVisible();
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(1);
  await expect(page.locator('#urlHistory .url-history-item').first()).toHaveText('github.com/lqh-2011');
  /* the match is the default highlight, so Enter opens it directly */
  await page.keyboard.press('Enter');
  expect(await opened(page)).toEqual(['https://github.com/lqh-2011']);
  await expect(page.locator('#q')).toHaveJSProperty('value', '');
  await expect(page.locator('#urlHistory')).toBeHidden();
});

/* ---------- history dropdown ---------- */

test('history dropdown: "Abrir este URL…" first, arrows navigate, Enter opens the highlighted row', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'github.com');
  await expect(page.locator('#urlHistory')).toBeVisible();
  /* row 0 is the action row (the typed text is a valid URL); the matching
     history entry follows */
  await expect(page.locator('#urlHistory .url-history-item')).toHaveCount(2);
  await expect(page.locator('#urlHistory .url-history-item').first()).toHaveText('Abrir este URL…');
  await expect(page.locator('#urlHistory .url-history-item').nth(1)).toHaveText('github.com/lqh-2011');

  await page.keyboard.press('Escape');
  await expect(page.locator('#urlHistory')).toBeHidden();

  /* ArrowDown moves the highlight onto the history entry; Enter opens it */
  await typeInBar(page, 'github.com');
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

  await typeInBar(page, 'github.com');
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

test('timer: command t opens the manager; z pauses/resumes, r resets, x deletes (confirm)', async ({ page }) => {
  await page.goto('/');
  await seedTimers(page, [runningDown('t1', 'Pomodoro', 1500)], { active: 't1', visible: true });

  /* command mode: `t` opens the timers manager (not a countdown value prompt) */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Temporizadores…');
  await expect(page.locator('#timerIcon')).toBeVisible();
  await expect(page.locator('#timerList')).toBeVisible();

  /* back out to command mode (timers -> settings -> command) */
  await backToCommand(page);

  /* z pauses: the timer freezes at its current value */
  await typeInBar(page, 'z');
  let list = await timers(page);
  expect(list[0].paused).not.toBeNull();
  const pausedSecs = list[0].paused.secs;
  expect(pausedSecs).toBeGreaterThan(0);
  expect(list[0].end).toBeNull();
  expect(list[0].start).toBeNull();

  /* z again resumes from where it paused — NOT a reset */
  await typeInBar(page, 'z');
  list = await timers(page);
  expect(list[0].paused).toBeNull();
  expect(list[0].end).toBeGreaterThan(Date.now());
  const remaining = Math.round((list[0].end - Date.now()) / 1000);
  expect(Math.abs(remaining - pausedSecs)).toBeLessThan(10);

  /* r resets back to the configured duration (idle) */
  await typeInBar(page, 'r');
  list = await timers(page);
  expect(list[0].end).toBeNull();
  expect(list[0].start).toBeNull();
  expect(list[0].paused).toBeNull();
  expect(await page.locator('#logo')).toHaveAttribute('aria-label', '25:00');

  /* x deletes the active timer (confirm s/y) and restores the logo */
  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');
  expect(await timers(page)).toHaveLength(0);
  expect(await activeTimerId(page)).toBeNull();
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', 'LQH-2011');
});

test('timer: x confirm from COMMAND mode kills the timer and returns to command mode (Comando… placeholder)', async ({ page }) => {
  await page.goto('/');
  /* a timer is already active on load */
  await seedTimers(page, [runningDown('t1', 'Pomodoro', 1500)], { active: 't1', visible: true });

  /* direct: enter command mode (active timer owns the slot) */
  await typeInBar(page, 'aaa');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');

  /* x arms the delete confirm; s confirms; Enter commits the prompt */
  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');

  /* killed */
  expect(await timers(page)).toHaveLength(0);
  expect(await activeTimerId(page)).toBeNull();

  /* the bar is STILL in command mode — not 'Favoritos…' */
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
});

test('timer: finished countdown flashes, flips to count-up (stays kind down), then settles', async ({ page }) => {
  await page.goto('/');

  /* 1-second countdown (0:01) so the elapse happens fast. The add flow now
     STARTS the timer, so no separate `y` is needed. */
  await typeInBar(page, 'aaa');
  await addTimer(page, { name: 'Temporizador', kind: 'down', dur: '0:01' });
  const end = (await timers(page))[0].end;
  expect(end).toBeGreaterThan(Date.now());

  /* after the elapse: the countdown clears `end` and sets `start` to its end
     time (still kind='down'), and the logo is flashing */
  await page.waitForTimeout(1600);
  const flipped = (await timers(page))[0];
  expect(flipped.kind).toBe('down');
  expect(flipped.end).toBeNull();
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

  /* x deletes the finished timer (confirm s/y) — back to command mode first */
  await backToCommand(page);
  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');
  expect(await timers(page)).toHaveLength(0);
});

/* ---------- timers manager ---------- */

test('timers manager: settings -> t shows a dropdown of timers (name, kind, live time)', async ({ page }) => {
  await page.goto('/');
  /* seed a running countdown and a running count-up */
  await seedTimers(page, [runningDown('t1', 'Pomodoro', 1500), runningUp('t2', 'Deep work')],
    { active: 't2', visible: true });

  /* command mode -> settings -> timers */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');

  await expect(page.locator('#timerList')).toBeVisible();
  await expect(page.locator('#timerList .timer-row')).toHaveCount(2);
  /* each row shows name + kind badge + a live time */
  const row0 = page.locator('#timerList .timer-row').nth(0);
  await expect(row0.locator('.timer-name')).toHaveText('Pomodoro');
  await expect(row0.locator('.timer-kind')).toHaveText('DOWN');
  await expect(row0.locator('.timer-time')).toHaveText(/^\d{2}:\d{2}$/);
  const row1 = page.locator('#timerList .timer-row').nth(1);
  await expect(row1.locator('.timer-name')).toHaveText('Deep work');
  await expect(row1.locator('.timer-kind')).toHaveText('UP');
  await expect(row1.locator('.timer-time')).toHaveText(/^\d{2}:\d{2}$/);
});

test('timers: digits 1-9 select the Nth timer in the manager (1 = first)', async ({ page }) => {
  await page.goto('/');
  await seedTimers(page, [
    runningDown('t1', 'One', 600),
    runningUp('t2', 'Two'),
    runningDown('t3', 'Three', 1200)
  ], { active: 't1', visible: true });

  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await expect(page.locator('#timerList')).toBeVisible();

  /* `2` selects the second timer (the count-up) */
  await typeInBar(page, '2');
  expect(await activeTimerId(page)).toBe('t2');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);
  /* `3` selects the third, and the highlight follows */
  await typeInBar(page, '3');
  expect(await activeTimerId(page)).toBe('t3');
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('Three');
});

test('timers: arrow keys move the highlight AND show the selected timer (matches digit selection)', async ({ page }) => {
  await page.goto('/');
  /* idle countdowns => deterministic display (the configured dur), so the logo
     check proves the arrows bound the exact timer, not just any MM:SS value. */
  await seedTimers(page, [
    { id: 't1', name: 'One', kind: 'down', dur: 10 * 60, end: null, start: null, paused: null },
    { id: 't2', name: 'Two', kind: 'down', dur: 25 * 60, end: null, start: null, paused: null },
    { id: 't3', name: 'Three', kind: 'down', dur: 5 * 60, end: null, start: null, paused: null }
  ], { active: 't1', visible: true });

  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await expect(page.locator('#timerList')).toBeVisible();

  /* highlight starts on the active timer (t1 -> 10:00) */
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('One');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '10:00');
  expect(await activeTimerId(page)).toBe('t1');

  /* ArrowDown moves to the 2nd timer (25:00) and binds it to the display slot */
  await page.keyboard.press('ArrowDown');
  expect(await activeTimerId(page)).toBe('t2');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '25:00');
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('Two');

  /* ArrowDown again -> 3rd timer (05:00) */
  await page.keyboard.press('ArrowDown');
  expect(await activeTimerId(page)).toBe('t3');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '05:00');
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('Three');

  /* ArrowUp goes back to the 2nd timer (25:00) and re-binds the slot */
  await page.keyboard.press('ArrowUp');
  expect(await activeTimerId(page)).toBe('t2');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '25:00');
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('Two');
});

test('timers manager: Enter on the highlighted timer starts it (same as y)', async ({ page }) => {
  await page.goto('/');
  /* two IDLE countdowns — moving the highlight to the SECOND timer and starting
     it proves Enter honours timerIndex (a regression that always starts the
     ACTIVE timer would wrongly start t1). */
  await seedTimers(page, [
    { id: 't1', name: 'Pomodoro', kind: 'down', dur: 25 * 60, end: null, start: null, paused: null },
    { id: 't2', name: 'Coffee', kind: 'down', dur: 10 * 60, end: null, start: null, paused: null }
  ], { active: 't1', visible: true });

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');
  await expect(page.locator('#timerList')).toBeVisible();
  /* the highlight starts on the active timer (t1 -> 25:00); both are idle */
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('Pomodoro');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '25:00');
  let list = await timers(page);
  expect(list[0].end).toBeNull();
  expect(list[1].end).toBeNull();

  /* move the highlight onto the SECOND timer (t2 -> 10:00) */
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText('Coffee');
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '10:00');
  expect(await activeTimerId(page)).toBe('t2');

  /* Enter (no `y`) starts the HIGHLIGHTED timer (t2), leaving t1 idle */
  await page.keyboard.press('Enter');
  list = await timers(page);
  expect(list[1].end).toBeGreaterThan(Date.now());   /* t2 running */
  expect(list[1].start).toBeNull();
  expect(list[1].paused).toBeNull();
  expect(list[0].end).toBeNull();                    /* t1 still idle */
  expect(list[0].start).toBeNull();
  /* the slot shows the started timer counting down; the bar stays in timers mode */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Temporizadores…');
});

test('timers manager: settings -> t, add a named countdown (starts running)', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Temporizadores…');

  await typeInBar(page, 'a');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Nombre del temporizador…');
  await typeInBar(page, 'Pomodoro');
  await page.keyboard.press('Enter');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Tipo (u = cuenta arriba, d = cuenta atrás)…');
  await typeInBar(page, 'd');
  await page.keyboard.press('Enter');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Duración (ej. 25, 05:00, 1:30:00)…');
  await typeInBar(page, '25');
  await page.keyboard.press('Enter');

  const list = await timers(page);
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('Pomodoro');
  expect(list[0].kind).toBe('down');
  expect(list[0].dur).toBe(25 * 60);
  /* the new countdown STARTS the moment it's added — no separate `y` needed */
  expect(list[0].end).toBeGreaterThan(Date.now());
  expect(list[0].start).toBeNull();
  expect(await activeTimerId(page)).toBe(list[0].id);
  /* the new timer owns the slot and shows a live countdown */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);
  /* and it appears in the dropdown */
  await expect(page.locator('#timerList .timer-row')).toHaveCount(1);
  await expect(page.locator('#timerList .timer-name').first()).toHaveText('Pomodoro');
  await expect(page.locator('#timerList .timer-kind').first()).toHaveText('DOWN');
  await expect(page.locator('#timerList .timer-time').first()).toHaveText(/^\d{2}:\d{2}$/);
});

test('timers manager: add a named count-up (starts running, shows a live time)', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');
  await typeInBar(page, 'a');
  await typeInBar(page, 'Deep work');
  await page.keyboard.press('Enter');
  await typeInBar(page, 'u');
  await page.keyboard.press('Enter');

  const list = await timers(page);
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('Deep work');
  expect(list[0].kind).toBe('up');
  /* the new count-up STARTS counting the moment it's added */
  expect(list[0].start).toBeGreaterThan(0);
  expect(list[0].end).toBeNull();
  /* the slot shows a live (counting up) time, not a frozen 00:00 */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);
  await expect(page.locator('#timerList .timer-kind').first()).toHaveText('UP');
  await expect(page.locator('#timerList .timer-time').first()).toHaveText(/^\d{2}:\d{2}$/);
});

test('timers manager: rename the highlighted timer (e -> name -> Enter -> Enter)', async ({ page }) => {
  await page.goto('/');

  /* seed one countdown (idle -> shows 25:00) and open the manager */
  await seedTimers(page, [{ id: 't1', name: 'Temporizador', kind: 'down', dur: 25 * 60, end: null, start: null, paused: null }],
    { active: 't1', visible: true });
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');

  /* the single timer is highlighted (index 0); `e` renames it directly */
  await typeInBar(page, 'e');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Nombre (Enter = dejar igual)…');
  await typeInBar(page, 'Pomodoro');
  await page.keyboard.press('Enter');   /* commit name -> dur step */
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Duración (Enter = dejar igual)…');
  await page.keyboard.press('Enter');   /* commit dur (kept) */

  const list = await timers(page);
  expect(list[0].name).toBe('Pomodoro');
  expect(list[0].dur).toBe(25 * 60);
  /* the dropdown reflects the rename */
  await expect(page.locator('#timerList .timer-name').first()).toHaveText('Pomodoro');
});

test('timers manager: delete the highlighted timer (x -> s) restores the logo', async ({ page }) => {
  await page.goto('/');

  /* seed one countdown (it is active + shown) and open the manager */
  await seedTimers(page, [{ id: 't1', name: 'Temporizador', kind: 'down', dur: 25 * 60, end: Date.now() + 1500 * 1000, start: null, paused: null }],
    { active: 't1', visible: true });
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');

  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');

  expect(await timers(page)).toHaveLength(0);
  /* the only timer was active -> its slot binding is cleared and the base view
     (brand logo here) is restored, not a successor (none remains) */
  expect(await activeTimerId(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('start.timerVisible'))).toBe('0');
  /* the deleted timer was active -> logo restored */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', 'LQH-2011');
  /* empty list -> dropdown hidden */
  await expect(page.locator('#timerList')).toBeHidden();
});

/* Deleting the bound timer must hand the display slot to the newly-selected
   timer (the one just above the deleted row, or the new first row when the
   first was deleted) instead of falling back to the clock/logo. */
async function deleteTimerAndCheckSlot(page, digit, { deletedId, remaining, newActiveId, newLogoLabel, newLogoRow }) {
  await typeInBar(page, String(digit));          /* select & show that timer */
  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');
  /* the deleted timer is GONE (exact record, not just a count) */
  const after = await timers(page);
  expect(after).toHaveLength(remaining);
  expect(after.some(t => t.id === deletedId)).toBe(false);
  /* the replacement timer owns the slot (not null -> not the clock/logo) */
  expect(await activeTimerId(page)).toBe(newActiveId);
  /* the logo shows the replacement timer's EXACT value (deterministic idle
     countdown) — distinguishing it from the clock (HH:MM:SS), the brand
     (LQH-2011) and any stale timer value left on screen */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', newLogoLabel);
  /* and the manager's highlight follows to the newly-selected row */
  await page.locator('#q').focus();
  await expect(page.locator('#timerList .timer-row.active .timer-name')).toHaveText(newLogoRow);
}

test('timers manager: deleting the FIRST timer binds the former second to the display slot', async ({ page }) => {
  await page.goto('/');
  /* idle countdowns render their configured dur, so successor labels are exact */
  await seedTimers(page, [
    idleDown('t1', 'Alpha', 1500),      /* 25:00 */
    idleDown('t2', 'Bravo', 2500),      /* 41:40 */
    idleDown('t3', 'Charlie', 3500),    /* 58:20 */
  ], { active: 't1', visible: true });
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');
  await deleteTimerAndCheckSlot(page, 1, { deletedId: 't1', remaining: 2, newActiveId: 't2', newLogoLabel: '41:40', newLogoRow: 'Bravo' });
});

test('timers manager: deleting a MIDDLE timer binds the timer above it to the display slot', async ({ page }) => {
  await page.goto('/');
  await seedTimers(page, [
    idleDown('t1', 'Alpha', 1500),
    idleDown('t2', 'Bravo', 2500),
    idleDown('t3', 'Charlie', 3500),
  ], { active: 't1', visible: true });
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');
  await deleteTimerAndCheckSlot(page, 2, { deletedId: 't2', remaining: 2, newActiveId: 't1', newLogoLabel: '25:00', newLogoRow: 'Alpha' });
});

test('timers manager: deleting the last row of a multi-timer list binds the timer above it to the display slot', async ({ page }) => {
  /* deletes the LAST row of three (leaving two) -> replacement branch. The
     empty-list / sole-timer branch is covered separately by the
     'delete the highlighted timer ... restores the logo' test above. */
  await page.goto('/');
  await seedTimers(page, [
    idleDown('t1', 'Alpha', 1500),
    idleDown('t2', 'Bravo', 2500),
    idleDown('t3', 'Charlie', 3500),
  ], { active: 't1', visible: true });
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');
  await deleteTimerAndCheckSlot(page, 3, { deletedId: 't3', remaining: 2, newActiveId: 't2', newLogoLabel: '41:40', newLogoRow: 'Bravo' });
});

test('timers manager: z pauses/resumes, r resets the highlighted timer', async ({ page }) => {
  await page.goto('/');

  /* seed one running countdown and open the manager */
  await seedTimers(page, [runningDown('t1', 'Temporizador', 1500)], { active: 't1', visible: true });
  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 't');

  /* z pauses the highlighted timer (freezes the value) */
  await typeInBar(page, 'z');
  let list = await timers(page);
  expect(list[0].paused).not.toBeNull();
  /* the dropdown row shows the frozen value (not ticking) */
  await expect(page.locator('#timerList .timer-time').first()).toHaveText(/^\d{2}:\d{2}$/);

  /* z again resumes (continues from where it paused) */
  await typeInBar(page, 'z');
  list = await timers(page);
  expect(list[0].paused).toBeNull();
  expect(list[0].end).toBeGreaterThan(Date.now());

  /* r resets to the configured duration (idle) */
  await typeInBar(page, 'r');
  list = await timers(page);
  expect(list[0].end).toBeNull();
  expect(list[0].paused).toBeNull();
  await expect(page.locator('#timerList .timer-time').first()).toHaveText('25:00');
});

test('timers: two timers run concurrently; a digit selects one and switches the display', async ({ page }) => {
  await page.goto('/');
  /* seed a running countdown + a running count-up; the count-up owns the slot */
  await seedTimers(page, [runningDown('t1', 'Pomodoro', 300), runningUp('t2', 'Deep work')],
    { active: 't2', visible: true });

  let list = await timers(page);
  expect(list).toHaveLength(2);
  expect(list[0].kind).toBe('down');
  expect(list[1].kind).toBe('up');
  /* both running independently */
  expect(list[0].end).toBeGreaterThan(Date.now());
  expect(list[1].start).toBeGreaterThan(0);
  /* the count-up is currently shown */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);

  /* open the manager and press `1` to select the countdown (first in the list) */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 't');
  await typeInBar(page, '1');
  expect(await activeTimerId(page)).toBe(list[0].id);
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);

  /* the count-up keeps running in the background */
  list = await timers(page);
  expect(list[1].start).toBeGreaterThan(0);
});

test('timer: a running countdown resumes after a reload (and never flashes the logo)', async ({ page }) => {
  await page.goto('/');

  /* seed a running countdown straight into localStorage, then reload */
  const end = Date.now() + 300 * 1000;
  await page.evaluate((e) => {
    localStorage.setItem('start.timers', JSON.stringify([{ id: 't1', name: 'Temporizador', kind: 'down', dur: 300, end: e, start: null, paused: null }]));
    localStorage.setItem('start.timerActive', 't1');
    localStorage.setItem('start.timerVisible', '1');
  }, end);
  await page.reload();

  const after = (await timers(page))[0];
  expect(after.id).toBe('t1');
  expect(after.end).toBe(end);
  /* it owns the display slot immediately — the label is the timer, not the logo */
  expect(await activeTimerId(page)).toBe('t1');
  const label = await logoLabel(page);
  expect(label).toMatch(/^\d{2}:\d{2}$/);
  expect(label).not.toBe('LQH-2011');
});

test('timer: the h hours preference survives a reload', async ({ page }) => {
  await page.goto('/');

  /* seed a running 25-min countdown (shows MM:SS by default) */
  await seedTimers(page, [runningDown('t1', 'Temporizador', 1500)], { active: 't1', visible: true });
  /* toggle h (command mode) -> HH:MM:SS display */
  await typeInBar(page, 'aaa');
  await typeInBar(page, 'h');
  await page.reload();

  /* hoursOn is restored -> the countdown shows HH:MM:SS */
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}:\d{2}$/);
});

test('timer: the old single-timer record migrates into the named list', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:8123' });
  await ctx.addInitScript(SEED);
  await ctx.addInitScript(() => {
    localStorage.setItem('start.timer', JSON.stringify({
      kind: 'down', end: Date.now() + 60000, hours: false, visible: true
    }));
  });
  const page = await ctx.newPage();
  await page.goto('/');

  const list = await timers(page);
  expect(list).toHaveLength(1);
  expect(list[0].kind).toBe('down');
  expect(list[0].end).toBeGreaterThan(Date.now());
  expect(await page.evaluate(() => localStorage.getItem('start.timer'))).toBeNull();
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', /^\d{2}:\d{2}$/);
  await ctx.close();
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

test('global z/r/x act on the active timer when the bar is not focused', async ({ page }) => {
  await page.goto('/');

  /* seed a running countdown */
  await seedTimers(page, [runningDown('t1', 'Temporizador', 1500)], { active: 't1', visible: true });

  /* blur the bar so the document-level shortcuts fire */
  await page.evaluate(() => document.activeElement.blur());

  /* global z pauses the active timer (brings it forward + freezes) */
  await page.keyboard.press('z');
  let list = await timers(page);
  expect(list[0].paused).not.toBeNull();

  /* global z resumes */
  await page.keyboard.press('z');
  list = await timers(page);
  expect(list[0].paused).toBeNull();
  expect(list[0].end).toBeGreaterThan(Date.now());

  /* global r resets to the configured duration */
  await page.keyboard.press('r');
  list = await timers(page);
  expect(list[0].end).toBeNull();
  await expect(page.locator('#logo')).toHaveAttribute('aria-label', '25:00');

  /* global x deletes the active timer (confirm s/y) */
  await page.keyboard.press('x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', '¿Borrar? (s/n)');
  await typeInBar(page, 's');
  await page.keyboard.press('Enter');
  expect(await timers(page)).toHaveLength(0);
});


/* ---------- reload handshake (regression: submode restore + listeners) ---------- */

test('r reloads into links mode (links/r) and the page stays interactive', async ({ page }) => {
  await page.goto('/');

  await typeInBar(page, 'aaa');
  await typeInBar(page, 's');
  await typeInBar(page, 'l');
  const loaded = page.waitForEvent('load');
  await typeInBar(page, 'r').catch(() => { /* reload may race the evaluate */ });
  await loaded;

  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Favoritos…');
  /* listeners must be registered after the restored-submode load */
  await typeInBar(page, 'a');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'URL del favorito…');
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

/* ---------- sync status indicator (typing bar) ---------- */
/* The page runs a pull on load when a token is present. The typing bar shows a
   spinning cycle-arrow while the pull is in flight, then a success tick or a
   warning that flashes and disappears. The static server would 404 /api/data,
   so these tests route it to control the outcome (and hold it open briefly so
   the spinner is observable). Visibility is read from getComputedStyle().display
   (not the `hidden` attribute), which is the reliable signal for <svg> icons. */

function syncShown(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).display !== 'none' : null;
  }, sel);
}

test('sync indicator: spinner on load, then a success tick that disappears (routed 200)', async ({ page }) => {
  /* hold the pull open so the cycle-arrow spinner is visible; an empty body
     means no merge, no reload — just a success tick */
  await page.route('**/api/data', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');

  /* the cycle-arrow (spinner) is visible while the pull is in flight */
  await expect.poll(() => syncShown(page, '#syncIcon .sync-loading')).toBe(true);

  /* the pull lands -> the success tick flashes, then the icon disappears */
  await expect.poll(() => syncShown(page, '#syncIcon .sync-ok')).toBe(true);
  await expect.poll(() => syncShown(page, '#syncIcon')).toBe(false);
});

test('sync indicator: warning on a failed pull, then disappears (routed 404)', async ({ page }) => {
  await page.route('**/api/data', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });
  await page.goto('/');

  /* spinner first */
  await expect.poll(() => syncShown(page, '#syncIcon .sync-loading')).toBe(true);

  /* then the warning flashes, and disappears */
  await expect.poll(() => syncShown(page, '#syncIcon .sync-warn')).toBe(true);
  await expect.poll(() => syncShown(page, '#syncIcon')).toBe(false);
});

test('sync indicator: merging new data flashes the success tick (before any reload)', async ({ page }) => {
  /* a newer item (ts > the local, empty start.sync.ts) makes `changed` true, so
     the automatic pull reloads to apply it — but the success tick must be shown
     FIRST, then the reload fires after the flash. */
  await page.route('**/api/data', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: { 'start.mode': { v: 'url', ts: 1234567890 } } })
  }));
  await page.goto('/');

  /* the tick is visible for the pull that merged the new data, before reload */
  await expect.poll(() => syncShown(page, '#syncIcon .sync-ok')).toBe(true);
});

test('sync indicator: a newer pull supersedes an in-flight one (generation guard)', async ({ page }) => {
  let count = 0;
  await page.route('**/api/data', async (route) => {
    count += 1;
    if (count === 1) {
      /* the initial load pull is held open; the manual p pull (2nd) resolves first */
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');

  /* the load pull (1st) is in flight; trigger a manual p pull (2nd, fast) */
  await page.locator('#q').focus();
  await typeInBar(page, 'aaa');
  await typeInBar(page, 'p');

  /* the 2nd pull resolves -> success tick flashes, then the icon hides */
  await expect.poll(() => syncShown(page, '#syncIcon .sync-ok')).toBe(true);
  await expect.poll(() => syncShown(page, '#syncIcon')).toBe(false);

  /* the (superseded) 1st pull completes later; the generation guard drops its
     result, so it must NOT re-show the icon/spinner */
  await page.waitForTimeout(1800);
  await expect.poll(() => syncShown(page, '#syncIcon')).toBe(false);
});
