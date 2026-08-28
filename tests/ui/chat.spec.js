/* UI smoke tests for the AI chat mode. The static server has no real chat
   API (the page's fetch to /api/* 404s), so we route /api/chat* to a fake
   that returns NDJSON streams / session lists, mirroring api/chat.js's
   contract. This exercises the FULL front-end flow: entering chat from
   command mode (`j`), the layout swap, the session sidebar (grouped by time),
   sending a message (streamed render), loading a session, and the `/x` exit. */
'use strict';

const { test, expect } = require('@playwright/test');

/* Seed a logged-in session + a window.open stub (no real tabs). The sync
   module re-seeds on every navigation, so the auth overlay stays hidden. */
const SEED = () => {
  localStorage.setItem('start.token', 'ci-fake-token');
  window.__opened = [];
  window.open = function (url) { window.__opened.push(url); return null; };
};

/* Build an NDJSON chat stream body, mirroring api/chat.js's output. */
function chatStream(overrides) {
  const o = overrides || {};
  const parts = [];
  parts.push(JSON.stringify({
    type: 'meta', sessionId: o.sessionId || 'sess-1', title: o.title || 'A new chat',
    userMessageId: 'u-1', assistantMessageId: 'a-1'
  }));
  (o.deltas || ['Hello!']).forEach((t) => parts.push(JSON.stringify({ type: 'delta', text: t })));
  parts.push(JSON.stringify({ type: 'done', ok: true }));
  return parts.join('\n') + '\n';
}

/* Mock the chat API. `sessions` = array for GET /api/chat-sessions;
   `messages` = object sessionId -> messages array per session. */
async function mockChat(page, opts) {
  const o = opts || {};
  const sessions = o.sessions || [];
  const messages = o.messages || {};

  /* keep the sync pull quiet (200, no changes -> no reload) */
  await page.route('**/api/data', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: {} }) }));

  await page.route('**/api/chat-sessions', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions }) }));

  await page.route('**/api/chat-messages*', async (r) => {
    if (r.request().method() === 'DELETE') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (r.request().method() === 'POST') {
      return r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: chatStream({ sessionId: 'sess-1', deltas: ['Regenerated reply.'] }) });
    }
    /* GET ?session=<id> — optional delay so a loading spinner is observable */
    if (o.messagesDelay) { await new Promise((res) => setTimeout(res, o.messagesDelay)); }
    const url = new URL(r.request().url());
    const sid = url.searchParams.get('session') || 'sess-1';
    return r.fulfill({ status: 200, contentType: 'application/json',
                       body: JSON.stringify({ messages: messages[sid] || [] }) });
  });

  await page.route('**/api/chat', (r) =>
    r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: chatStream({ sessionId: 'sess-1' }) }));
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(SEED);
});

async function typeInBar(page, text) {
  await page.locator('#q').focus();
  await page.evaluate((t) => {
    const input = document.getElementById('q');
    input.value = t;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

async function enterChat(page) {
  await typeInBar(page, 'aaa');   /* command mode */
  await typeInBar(page, 'j');     /* AI chat */
}

/* ---------- entering chat (j) ---------- */

test('j enters AI chat: logo collapses, bar docks to bottom, hamburger + send arrow, placeholder', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);

  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/chat-open/);
  /* logo hidden, bar full width at the bottom */
  await expect(page.locator('#logo')).toBeHidden();
  await expect(page.locator('.chat-indicator')).toBeVisible();
  await expect(page.locator('#searchIcon')).toBeHidden();
  /* the left mode indicator is the hamburger; placeholder is the chat prompt */
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Pregunta algo...');
  /* the send arrow replaces the sync icon */
  await expect(page.locator('#chatSendBtn')).toBeVisible();
  await expect(page.locator('#syncIcon')).toBeHidden();
  /* the send button is disabled with an empty bar */
  await expect(page.locator('#chatSendBtn')).toBeDisabled();
});

test('exiting chat via / then x returns to command mode and restores the layout', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);

  await typeInBar(page, '/');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Salir del chat… (x)');

  await typeInBar(page, 'x');
  await expect(page.locator('#q')).toHaveAttribute('placeholder', 'Comando…');
  await expect(page.locator('body')).not.toHaveClass(/chat-open/);
  await expect(page.locator('#chatView')).toBeHidden();
  await expect(page.locator('#logo')).toBeVisible();
  await expect(page.locator('#cmdIndicator')).toBeVisible();
});

/* ---------- sidebar ---------- */

test('sidebar toggle slides in and folds; session list is grouped by time', async ({ page }) => {
  const now = Date.now();
  const sessions = [
    { id: 's-today', title: 'Today query', updated_at: now, last_message: 'Today answer' },
    { id: 's-yesterday', title: 'Yesterday query', updated_at: now - 86400000, last_message: 'Y answer' },
    { id: 's-week', title: 'This week query', updated_at: now - 2 * 86400000, last_message: 'W answer' },
    { id: 's-earlier', title: 'Earlier query', updated_at: now - 30 * 86400000, last_message: 'E answer' }
  ];
  await mockChat(page, { sessions });
  await page.goto('/');
  await enterChat(page);

  const toggle = page.locator('#chatSidebarToggle');
  await expect(page.locator('#chatSidebar')).not.toHaveClass(/open/);
  await toggle.click();
  await expect(page.locator('#chatSidebar')).toHaveClass(/open/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  /* grouped headings, in order */
  await expect(page.locator('.chat-session-item')).toHaveCount(4);
  const labels = await page.locator('.chat-session-group').allTextContents();
  expect(labels).toEqual(['Hoy', 'Ayer', 'Esta semana', 'Anteriores']);
  await expect(page.locator('.chat-session-item').first()).toHaveText('Today query');

  /* clicking again folds it */
  await toggle.click();
  await expect(page.locator('#chatSidebar')).not.toHaveClass(/open/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('clicking a session loads and renders its messages', async ({ page }) => {
  const messages = {
    's-today': [
      { id: 'm1', role: 'user', content: 'Hi there', created_at: Date.now() },
      { id: 'm2', role: 'assistant',
        content: '> a **quote**\n\nSee [MDN](https://developer.mozilla.org?a=1&b=2) for more.',
        created_at: Date.now() + 1 }
    ]
  };
  await mockChat(page, {
    sessions: [{ id: 's-today', title: 'Today query', updated_at: Date.now(), last_message: 'Hi there' }],
    messages
  });
  await page.goto('/');
  await enterChat(page);

  await page.locator('#chatSidebarToggle').click();
  await page.locator('.chat-session-item').first().click();

  await expect(page.locator('#chatMessages .chat-msg.user')).toHaveCount(1);
  await expect(page.locator('#chatMessages .chat-msg.assistant')).toHaveCount(1);
  /* markdown: bold + blockquote render (blockquotes previously never matched
     because the whole text was escaped before the '>' check) */
  await expect(page.locator('#chatMessages .chat-msg.assistant .msg-bubble strong')).toHaveText('quote');
  await expect(page.locator('#chatMessages .chat-msg.assistant .msg-bubble blockquote')).toHaveCount(1);
  /* links are NOT double-encoded: the & stays a single literal (the browser
     decodes the one &amp; entity on parse; double-encoding would leave &amp;) */
  const href = await page.locator('#chatMessages .chat-msg.assistant .msg-bubble a').getAttribute('href');
  expect(href).toBe('https://developer.mozilla.org?a=1&b=2');
});

/* ---------- sending a message ---------- */

test('send a message: user + streamed assistant reply render, actions appear', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);

  await typeInBar(page, 'What is 2+2?');
  await expect(page.locator('#chatSendBtn')).toBeEnabled();
  await page.locator('#q').press('Enter');

  await expect(page.locator('#chatMessages .chat-msg.user')).toHaveCount(1);
  await expect(page.locator('#chatMessages .chat-msg.user .msg-bubble')).toHaveText('What is 2+2?');
  /* the streamed assistant reply appears */
  await expect(page.locator('#chatMessages .chat-msg.assistant .msg-bubble')).toHaveText('Hello!');
  /* both messages expose copy/delete; assistant also regenerate */
  await expect(page.locator('#chatMessages .chat-msg.user .msg-action')).toHaveCount(2);
  await expect(page.locator('#chatMessages .chat-msg.assistant .msg-action')).toHaveCount(3);
  /* the send button re-disables once the input is cleared */
  await expect(page.locator('#chatSendBtn')).toBeDisabled();
});

test('a blank chat shows the "Think before you ask." block-art welcome', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);

  /* the empty-thread welcome is the block-art sentence, not a plain string */
  await expect(page.locator('#chatMessages .chat-ascii')).toBeVisible();
  await expect(page.locator('#chatMessages .chat-ascii'))
    .toHaveAttribute('aria-label', 'Think before you ask.');
  await expect(page.locator('#chatMessages .chat-msg')).toHaveCount(0);
});

test('New chat starts a blank thread, folds the sidebar, and clears the thread', async ({ page }) => {
  const now = Date.now();
  await mockChat(page, {
    sessions: [{ id: 's1', title: 'Existing thread', updated_at: now, last_message: 'hi' }],
    messages: { s1: [{ id: 'm1', role: 'user', content: 'hi', created_at: now }] }
  });
  await page.goto('/');
  await enterChat(page);

  /* open a session so there is a thread to be cleared */
  await page.locator('#chatSidebarToggle').click();
  await page.locator('.chat-session-item').first().click();
  await expect(page.locator('#chatMessages .chat-msg.user')).toHaveCount(1);

  /* the New chat button clears it and folds the sidebar */
  await page.locator('#chatNewBtn').click();
  await expect(page.locator('#chatMessages .chat-msg')).toHaveCount(0);
  await expect(page.locator('#chatMessages .chat-ascii')).toBeVisible();
  await expect(page.locator('#chatSidebar')).not.toHaveClass(/open/);
  await expect(page.locator('#chatSidebarToggle')).toHaveAttribute('aria-expanded', 'false');
});

test('deleting a message removes it from the thread (mocked DELETE)', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);

  await typeInBar(page, 'delete me');
  await page.locator('#q').press('Enter');
  await expect(page.locator('#chatMessages .chat-msg.user')).toHaveCount(1);
  /* wait for the streamed reply to finish so it can't race the delete */
  await expect(page.locator('#chatMessages .chat-msg.assistant .msg-bubble')).toHaveText('Hello!');

  /* delete the user message (trash action) */
  await page.locator('#chatMessages .chat-msg.user .msg-action').nth(1).click();
  await expect(page.locator('#chatMessages .chat-msg.user')).toHaveCount(0);
});

/* ---------- indicator overlap on '/' ---------- */

test('pressing / in chat hides the hamburger so only the ❯ exit indicator shows', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);

  /* in chat mode the three-line hamburger is the left indicator */
  await expect(page.locator('#chatIndicator')).toBeVisible();
  await expect(page.locator('#cmdIndicator')).toBeHidden();

  /* arming exit shows ❯ and must NOT leave the hamburger painted on top */
  await typeInBar(page, '/');
  await expect(page.locator('#chatIndicator')).toBeHidden();
  await expect(page.locator('#cmdIndicator')).toBeVisible();
});

/* ---------- typing-bar fixed width ---------- */

test('the typing bar keeps a fixed max-width when the sidebar opens (no shrink/slide)', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);
  const maxW = () => page.locator('form.search').evaluate((el) => getComputedStyle(el).maxWidth);

  /* let the chat-entry max-width transition settle, then measure */
  await page.waitForTimeout(450);
  const before = await maxW();
  await page.locator('#chatSidebarToggle').click();
  await expect(page.locator('#chatSidebar')).toHaveClass(/open/);
  /* next assertion only after the sidebar-open transition settles */
  await page.waitForTimeout(400);
  const after = await maxW();
  expect(after).toBe(before);
});

/* ---------- mobile drawer + backdrop ---------- */

test('mobile: the sidebar is a drawer on top with a grey backdrop that folds on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockChat(page, { sessions: [{ id: 's1', title: 'Thread', updated_at: Date.now() }] });
  await page.goto('/');
  await enterChat(page);

  /* on desktop the backdrop is never rendered; on mobile it appears opened */
  const backdrop = page.locator('#chatSidebarBackdrop');
  await expect(backdrop).not.toHaveClass(/open/);

  await page.locator('#chatSidebarToggle').click();
  await expect(page.locator('#chatSidebar')).toHaveClass(/open/);
  await expect(backdrop).toHaveClass(/open/);
  /* let the scrim's opacity transition finish, then assert it is opaque */
  await page.waitForTimeout(350);
  const op = await backdrop.evaluate((el) => getComputedStyle(el).opacity);
  expect(op).toBe('1');

  /* tapping the uncovered (right) area of the scrim folds the drawer */
  await backdrop.click({ position: { x: 360, y: 400 } });
  await expect(page.locator('#chatSidebar')).not.toHaveClass(/open/);
  await expect(backdrop).not.toHaveClass(/open/);
});

test('desktop: the sidebar slides over (no backdrop rendered) and pushes the thread', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);
  await page.locator('#chatSidebarToggle').click();
  await expect(page.locator('#chatSidebar')).toHaveClass(/open/);
  /* the backdrop stays display:none on widths above the breakpoint */
  const disp = await page.locator('#chatSidebarBackdrop').evaluate((el) => getComputedStyle(el).display);
  expect(disp).toBe('none');
});

/* ---------- loading a past conversation ---------- */

test('loading a past session shows a spinner, not the "Think before you ask." welcome', async ({ page }) => {
  await mockChat(page, {
    sessions: [{ id: 's1', title: 'Load me', updated_at: Date.now() }],
    messages: { s1: [{ id: 'm1', role: 'assistant', content: 'Loaded reply', created_at: Date.now() }] },
    messagesDelay: 350
  });
  await page.goto('/');
  await enterChat(page);
  await page.locator('#chatSidebarToggle').click();
  await page.locator('.chat-session-item').first().click();

  /* while fetching: a spinner, and no new-thread welcome */
  await expect(page.locator('#chatMessages .chat-loading .spinner')).toBeVisible();
  await expect(page.locator('#chatMessages .chat-ascii')).toBeHidden();

  /* once loaded the message renders and the spinner is gone */
  await expect(page.locator('#chatMessages .chat-msg.assistant .msg-bubble')).toHaveText('Loaded reply');
  await expect(page.locator('#chatMessages .chat-loading')).toBeHidden();
});

/* ---------- markdown tables + inline code ---------- */

test('markdown tables render with a bordered table structure', async ({ page }) => {
  const messages = {
    s1: [{ id: 'm1', role: 'assistant',
           content: '| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | **25** |',
           created_at: Date.now() }]
  };
  await mockChat(page, { sessions: [{ id: 's1', title: 'T', updated_at: Date.now() }], messages });
  await page.goto('/');
  await enterChat(page);
  await page.locator('#chatSidebarToggle').click();
  await page.locator('.chat-session-item').first().click();

  await expect(page.locator('#chatMessages table')).toHaveCount(1);
  await expect(page.locator('#chatMessages table th')).toHaveCount(2);
  await expect(page.locator('#chatMessages table th').first()).toHaveText('Name');
  /* two body rows, each with the header's column count */
  await expect(page.locator('#chatMessages table tbody tr')).toHaveCount(2);
  await expect(page.locator('#chatMessages table tbody td')).toHaveCount(4);
  /* inline markdown works inside a cell */
  await expect(page.locator('#chatMessages table tbody tr').first()).toContainText('Alice');
});

test('inline code keeps readable (ink) text on its chip, not white-on-white', async ({ page }) => {
  await mockChat(page);
  await page.goto('/');
  await enterChat(page);
  await typeInBar(page, 'Run `npm test` please');
  await page.locator('#q').press('Enter');

  const code = page.locator('#chatMessages .chat-msg.user .msg-bubble code');
  await expect(code).toHaveText('npm test');
  const colors = await code.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, bg: cs.backgroundColor };
  });
  /* text colour must differ from its own chip background (the old white-on-white bug) */
  expect(colors.color).not.toBe(colors.bg);
});
