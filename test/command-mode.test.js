'use strict';

/**
 * Tests for the case-insensitive command-mode behavior introduced in index.html.
 *
 * The page is a single self-contained HTML file with an inline <script> and no
 * build tooling, so these tests extract that inline script and execute it in a
 * minimal, hand-rolled DOM/localStorage sandbox (via Node's built-in `vm`
 * module). This avoids adding any external dependencies while still exercising
 * the real, unmodified source of index.html.
 *
 * Scope: only the behavior changed by this PR is covered — i.e. that entering
 * command mode ("aaa") and the command letters (b/g/d/w/k) are now
 * case-insensitive. Pre-existing, unchanged behavior (e.g. submit handling) is
 * intentionally left untested here.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

function extractInlineScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const script = matches.find((s) => s.includes('enterCmd'));
  assert.ok(script, 'expected to find the command-mode inline script in index.html');
  return script;
}

function createElement(defaults) {
  const handlers = {};
  return Object.assign(
    {
      value: '',
      name: '',
      placeholder: '',
      hidden: false,
      action: '',
      dataset: {},
      classList: {
        _set: new Set(),
        add(c) {
          this._set.add(c);
        },
        remove(c) {
          this._set.delete(c);
        },
        contains(c) {
          return this._set.has(c);
        },
      },
      addEventListener(type, fn) {
        (handlers[type] = handlers[type] || []).push(fn);
      },
      _trigger(type, evt) {
        (handlers[type] || []).forEach((fn) => fn(evt));
      },
    },
    defaults
  );
}

function createLocalStorage(initial) {
  const store = Object.assign({}, initial);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    _store: store,
  };
}

/**
 * Builds a fresh, minimal DOM/localStorage sandbox matching the ids/selectors
 * that index.html's inline script queries, then executes the real inline
 * script from index.html inside it.
 */
function setupPage({ localStorageInitial } = {}) {
  const root = createElement();
  const form = createElement();
  const input = createElement();
  const indicator = createElement({ hidden: true });
  const searchIcon = createElement({ hidden: false });

  const localStorage = createLocalStorage(localStorageInitial);

  const document = {
    documentElement: root,
    querySelector(sel) {
      if (sel === '.search') return form;
      throw new Error(`Unexpected selector: ${sel}`);
    },
    getElementById(id) {
      if (id === 'q') return input;
      if (id === 'cmdIndicator') return indicator;
      if (id === 'searchIcon') return searchIcon;
      throw new Error(`Unexpected id: ${id}`);
    },
  };

  const context = vm.createContext({ document, localStorage, console });
  vm.runInContext(extractInlineScript(), context);

  function type(value) {
    input.value = value;
    input._trigger('input');
  }

  return { root, form, input, indicator, searchIcon, localStorage, type };
}

/* ---------- entering command mode ("aaa") is case-insensitive ---------- */

test('entering command mode with lowercase "aaa"', () => {
  const { type, indicator, searchIcon, form } = setupPage();
  type('aaa');
  assert.equal(indicator.hidden, false);
  assert.equal(searchIcon.hidden, true);
  assert.ok(form.classList.contains('cmd'));
});

test('entering command mode with uppercase "AAA"', () => {
  const { type, indicator, searchIcon } = setupPage();
  type('AAA');
  assert.equal(indicator.hidden, false);
  assert.equal(searchIcon.hidden, true);
});

test('entering command mode with mixed case "Aaa"', () => {
  const { type, indicator } = setupPage();
  type('Aaa');
  assert.equal(indicator.hidden, false);
});

test('typing anything other than "aaa" (in any case) does not enter command mode', () => {
  const { type, indicator } = setupPage();
  type('aab');
  assert.equal(indicator.hidden, true);
  type('AAAA');
  assert.equal(indicator.hidden, true);
});

/* ---------- command letters are case-insensitive ---------- */

test('command "b" (lowercase) sets engine to bing and exits command mode', () => {
  const { type, input, form, indicator } = setupPage();
  type('aaa');
  type('b');
  assert.equal(form.action, 'https://cn.bing.com/search');
  assert.equal(input.name, 'q');
  assert.equal(input.placeholder, 'Buscar en Bing…');
  assert.equal(indicator.hidden, true);
  assert.equal(input.value, '');
});

test('command "g" (lowercase) sets engine to google and exits command mode', () => {
  const { type, input, form } = setupPage();
  type('aaa');
  type('g');
  assert.equal(form.action, 'https://www.google.com/search');
  assert.equal(input.placeholder, 'Buscar en Google…');
});

test('command "d" (lowercase) sets engine to deepseek and exits command mode', () => {
  const { type, input, form } = setupPage();
  type('aaa');
  type('d');
  assert.equal(form.action, 'https://chat.deepseek.com/');
  assert.equal(input.placeholder, 'Buscar en DeepSeek…');
});

test('command "w" (lowercase) sets engine to wikipedia and exits command mode', () => {
  const { type, input, form } = setupPage();
  type('aaa');
  type('w');
  assert.equal(form.action, 'https://en.wikipedia.org/w/index.php');
  assert.equal(input.name, 'search');
  assert.equal(input.placeholder, 'Buscar en Wikipedia…');
});

test('uppercase command letters (B/G/D/W) behave identically to their lowercase counterparts', () => {
  const cases = [
    { letter: 'B', engine: 'bing', action: 'https://cn.bing.com/search' },
    { letter: 'G', engine: 'google', action: 'https://www.google.com/search' },
    { letter: 'D', engine: 'deepseek', action: 'https://chat.deepseek.com/' },
    { letter: 'W', engine: 'wikipedia', action: 'https://en.wikipedia.org/w/index.php' },
  ];

  for (const { letter, engine, action } of cases) {
    const { type, form, indicator, localStorage } = setupPage();
    type('aaa');
    type(letter);
    assert.equal(form.action, action, `expected uppercase "${letter}" to select ${engine}`);
    assert.equal(localStorage.getItem('start.engine'), engine, `expected "${letter}" to persist engine=${engine}`);
    assert.equal(indicator.hidden, true, `expected "${letter}" to exit command mode`);
  }
});

test('command "k" toggles theme (case-insensitive) and stays in command mode', () => {
  const { type, root, indicator, localStorage } = setupPage();
  type('aaa');

  type('K');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(localStorage.getItem('start.theme'), 'dark');
  assert.equal(indicator.hidden, false, 'command mode should remain active after "k"');

  type('k');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(localStorage.getItem('start.theme'), 'light');
  assert.equal(indicator.hidden, false, 'command mode should remain active after "k"');
});

/* ---------- unchanged branch structure / edge cases ---------- */

test('command letters are only recognized while already in command mode', () => {
  const { type, form, indicator } = setupPage();
  type('g');
  assert.equal(indicator.hidden, true, 'should not have entered command mode');
  assert.notEqual(form.action, 'https://www.google.com/search');
});

test('an unrecognized character exits command mode without changing the engine', () => {
  const { type, indicator, searchIcon, form } = setupPage();
  type('aaa');
  const actionBeforeUnrecognized = form.action;

  type('x');

  assert.equal(indicator.hidden, true);
  assert.equal(searchIcon.hidden, false);
  assert.equal(form.action, actionBeforeUnrecognized);
});

test('typing "aaa" again while already in command mode exits command mode (not treated as a command)', () => {
  const { type, indicator } = setupPage();
  type('aaa');
  assert.equal(indicator.hidden, false);

  type('aaa');
  assert.equal(indicator.hidden, true, '"aaa" is not one of b/g/d/w/k, so it should fall through to exitCmd()');
});

test('clearing the input while in command mode exits command mode', () => {
  const { type, indicator, searchIcon } = setupPage();
  type('aaa');
  assert.equal(indicator.hidden, false);

  type('');
  assert.equal(indicator.hidden, true);
  assert.equal(searchIcon.hidden, false);
});