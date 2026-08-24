// Shared browser shim for the app's test suites.
// The app is plain classic scripts, so each suite loads the real files into a
// V8 sandbox with just enough DOM to run, then asserts on what they produced.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const APP = path.resolve(__dirname, '..');

function makeEl(id) {
  const el = {
    id, style: {}, value: '', textContent: '', _h: '', disabled: false, files: [],
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, remove() {}, appendChild() {},
    addEventListener() {}, focus() {}, click() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return makeEl('closest'); },
    insertAdjacentHTML(pos, html) {
      this._h = pos === 'afterbegin' ? html + this._h : this._h + html;
    },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._h; }, set(v) { this._h = v; },
  });
  return el;
}

// files: which app scripts to load. store: initial localStorage contents.
// fetch: (url, opts) => Promise, so network is always explicit in a test.
function createSandbox({ files = ['data.js', 'app.js'], store = {}, fetch, capacitor, userAgent } = {}) {
  const els = {}, fetches = [], tracked = [], nav = [];
  const localStorage = {
    _d: Object.assign({}, store),
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
    key(i) { return Object.keys(this._d)[i]; },
    get length() { return Object.keys(this._d).length; },
  };
  const document = {
    getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
    querySelector(sel) { return /error-boundary/.test(sel) ? (els._boundary || null) : makeEl('q'); },
    querySelectorAll() { return []; },
    createElement() { return makeEl('created'); },
    addEventListener() {},
    head: { appendChild() {} },
    body: { appendChild(el) { els._boundary = el; } },
    documentElement: makeEl('html'),
    scripts: [{ src: 'https://get-arete.com/app.js?v=test' }],
    activeElement: null, visibilityState: 'visible',
  };
  const sandbox = {
    localStorage, document, console,
    _els: els, _fetches: fetches, _tracked: tracked, _nav: nav,
    window: {
      addEventListener() {},
      matchMedia() { return { matches: false, addEventListener() {} }; },
      Arete: null, Capacitor: capacitor,
    },
    navigator: {
      onLine: true, userAgent: userAgent || 'Mozilla/5.0',
      sendBeacon() {}, vibrate() {}, share: null,
      clipboard: { writeText() { return Promise.resolve(); } },
    },
    location: { search: '', hash: '', href: 'https://get-arete.com/', replace() {}, reload() {} },
    fetch: (url, opts) => {
      fetches.push({ url: String(url), opts: opts || {} });
      return (fetch || (() => Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({}), text: () => Promise.resolve(''),
      })))(String(url), opts || {});
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Set, Map, Intl,
    requestIdleCallback: cb => setTimeout(cb, 0),
    requestAnimationFrame: cb => setTimeout(cb, 0),
    gtag() {}, dataLayer: [],
    URL, URLSearchParams, TextEncoder, TextDecoder,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    Object, Array, String, Number, Boolean, Error, RegExp,
    isNaN, isFinite, parseInt, parseFloat,
  };
  if (capacitor) sandbox.Capacitor = capacitor;
  sandbox.window.localStorage = localStorage;
  sandbox.window.document = document;
  sandbox.window.location = sandbox.location;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const warnings = [];
  for (const f of files) {
    try { vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f }); }
    catch (e) { warnings.push(`${f}: ${String(e.message).slice(0, 110)}`); }
  }
  sandbox._warnings = warnings;
  return sandbox;
}

// Run an expression inside the sandbox. Errors are reported, not thrown, so one
// bad assertion can't abort a whole suite.
function run(sandbox, expr) {
  try { return vm.runInContext(expr, sandbox); }
  catch (e) { console.log('    [sandbox error]', String(e.message).slice(0, 150)); return null; }
}

function createReporter(suiteName) {
  let pass = 0, fail = 0;
  return {
    section(t) { console.log(`\n  ${t}`); },
    check(name, cond, extra = '') {
      if (cond) { console.log(`    PASS  ${name}`); pass++; }
      else { console.log(`    FAIL  ${name} ${extra}`); fail++; }
    },
    finish() {
      console.log(`\n  ${suiteName}: ${fail === 0 ? `ALL ${pass} PASSED` : `${pass} passed, ${fail} FAILED`}`);
      return fail;
    },
  };
}

module.exports = { APP, makeEl, createSandbox, run, createReporter };
