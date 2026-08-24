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

  await page.route('**/api/chat-messages*', (r) => {
    if (r.request().method() === 'DELETE') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (r.request().method() === 'POST') {
      return r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: chatStream({ sessionId: 'sess-1', deltas: ['Regenerated reply.'] }) });
    }
    /* GET ?session=<id> */
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
