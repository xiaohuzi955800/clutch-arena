/* Focused controller tests using the real leaderboard and screen wiring. */
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');

function makeApp() {
  var elements = {};
  var timers = 0;
  function element(id) {
    if (elements[id]) return elements[id];
    var classes = {};
    var el = {
      id: id, textContent: '', innerHTML: '', value: '', disabled: false,
      listeners: {}, parentNode: { insertBefore: function () {} },
      classList: {
        add: function (name) { classes[name] = true; },
        remove: function (name) { delete classes[name]; },
        contains: function (name) { return !!classes[name]; }
      },
      addEventListener: function (type, fn) { this.listeners[type] = fn; },
      appendChild: function () {}, setAttribute: function () {}, focus: function () {},
      click: function () { if (this.listeners.click) this.listeners.click.call(this, { detail: 1 }); }
    };
    elements[id] = el;
    return el;
  }
  var screens = ['screen-home', 'screen-game', 'screen-score', 'screen-duel-setup', 'screen-duel-result', 'screen-display'];
  screens.forEach(element);
  element('screen-home').classList.add('active');
  var document = {
    readyState: 'complete', body: element('body'),
    getElementById: element,
    querySelectorAll: function () { return screens.map(element); },
    createElement: function () { return element('created-' + (++timers)); },
    addEventListener: function () {}
  };
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var app = {
    document: document, localStorage: storage, URLSearchParams: URLSearchParams,
    setTimeout: function () { return ++timers; }, clearTimeout: function () {},
    setInterval: function () { return ++timers; }, clearInterval: function () {},
    performance: { now: function () { return 0; } },
    location: { search: '?attract=0' }, addEventListener: function () {},
    scrollTo: function () {},
    matchMedia: function () { return { matches: false }; },
    ClutchRng: { randomSeed: function () { return 1; } },
    ClutchSfx: { unlock: function () {}, click: function () {}, roundClear: function () {},
      isEnabled: function () { return true; }, setEnabled: function () {} },
    ClutchDisplay: { start: function () {}, refresh: function () {} },
    ClutchGame: function (canvas, callbacks) { this.callbacks = callbacks; app.game = this; }
  };
  app.ClutchGame.prototype.startRun = function () {};
  app.window = app;
  vm.createContext(app);
  vm.runInContext(fs.readFileSync('js/leaderboard.js', 'utf8'), app);
  vm.runInContext(fs.readFileSync('js/main.js', 'utf8'), app);
  return { app: app, element: element };
}

function record(board, score, name) {
  assert(board.add({ name: name || 'OLD', score: score, rounds: 1, acc: 50 }, {}));
}

function score(app, value) {
  app.game.callbacks.onGameOver({ score: value, victory: false, rank: 'ROOKIE', hits: 1,
    accuracy: 50, avgReaction: 500, bestFlick: 500, bestCombo: 1, roundsWon: 1 });
}

var test = makeApp();
record(test.app.ClutchBoard, 1000);
score(test.app, 1000);
assert.match(test.element('score-today-rank').innerHTML, /RANK #2/,
  'an unsaved tie follows existing equal scores');
test.element('initials-input').value = 'NEW';
record(test.app.ClutchBoard, 1200, 'TOP');
test.element('btn-save-score').click();
assert.match(test.element('score-today-rank').innerHTML, /RANK #3/,
  'after saving, show the saved entry position rather than a prospective position');

var full = makeApp();
for (var i = 0; i < 10; i++) record(full.app.ClutchBoard, 1000 - i * 10);
full.app.localStorage.removeItem('clutch-arena:board:alltime');
score(full.app, 910);
assert.match(full.element('score-today-rank').innerHTML, /Outside today/,
  'a tie at the cutoff is outside the board');
full.element('initials-input').value = 'NEW';
full.element('btn-save-score').click();
assert.match(full.element('score-today-rank').innerHTML, /Outside today/,
  'an all-time save does not claim a discarded daily entry');

var empty = makeApp();
score(empty.app, 0);
assert.match(empty.element('score-today-rank').innerHTML, /No scores/,
  'zero does not claim first place on an empty board');
console.log('Controller rank tests passed');