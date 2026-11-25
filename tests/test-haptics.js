/* Focused haptic feedback tests (run with: node tests/test-haptics.js). */
'use strict';
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');

var calls = [];
var app = {
  performance: { now: function () { return 1000; } },
  requestAnimationFrame: function () { return 1; },
  cancelAnimationFrame: function () {},
  addEventListener: function () {},
  removeEventListener: function () {},
  navigator: { vibrate: function (duration) { calls.push(duration); } },
  ClutchSfx: { hit: function () {}, miss: function () {}, shot: function () {}, gameOver: function () {} }
};
app.window = app;
vm.createContext(app);
vm.runInContext(fs.readFileSync('js/rng.js', 'utf8'), app);
vm.runInContext(fs.readFileSync('js/game.js', 'utf8'), app);
var canvas = {
  getContext: function () { return { setTransform: function () {} }; },
  getBoundingClientRect: function () { return { width: 400, height: 300 }; },
  addEventListener: function () {}, removeEventListener: function () {}
};
var game = new app.ClutchGame(canvas);
game.reducedMotion = true;

function start(opts) {
  game.startRun(opts || { seed: 1 });
  game.state = 'playing';
}
function target(spawnAt, peek) {
  return { px: 50, py: 50, currentRadius: 10, spawnAt: spawnAt, peek: peek, color: '#fff' };
}
function exercise() {
  game.active = [target(900, 500)];
  assert.strictEqual(game.handleShot(50, 50), true);
  assert.strictEqual(game.handleShot(0, 0), false);
  game.active = [target(500, 500)];
  assert.strictEqual(game._expireTargets(1000), true);
}

start();
exercise();
assert.deepStrictEqual(calls, [15, 25, 60], 'live hit, miss, and damage vibrate');
calls.length = 0;
start({ seed: 1, attract: true });
exercise();
assert.deepStrictEqual(calls, [], 'attract hit, miss, and damage are silent');
start();
exercise();
assert.deepStrictEqual(calls, [15, 25, 60], 'live runs restore haptics after attract');

delete app.navigator;
start();
assert.doesNotThrow(exercise, 'missing navigator is safe');
app.navigator = { vibrate: null };
start();
assert.doesNotThrow(exercise, 'missing vibrate is safe');
app.navigator = { vibrate: function () { throw new Error('unavailable'); } };
start();
assert.doesNotThrow(exercise, 'vibrate errors do not interrupt play');

calls.length = 0;
app.navigator = { vibrate: function (duration) { calls.push(duration); } };
start();
game.hp = 1;
game.active = [target(500, 500)];
assert.strictEqual(game.handleShot(0, 0), false);
assert.deepStrictEqual(calls, [60], 'fatal expiry vibrates for damage but not a miss');
calls.length = 0;
assert.strictEqual(game.handleShot(0, 0), false);
assert.deepStrictEqual(calls, [], 'input after the run is silent');
console.log('Haptic feedback tests passed');