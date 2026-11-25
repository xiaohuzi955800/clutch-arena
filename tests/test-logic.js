/* Logic tests for Clutch Arena (run with: node tests/test-logic.js).
   Covers: seeded RNG determinism, spawn-plan structure & fairness,
   scoring, combo multiplier, ranks. No DOM needed. */
'use strict';
const fs = require('fs');
const path = require('path');

function load(rel) {
  eval(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')); // eslint-disable-line no-eval
}
load('js/rng.js');
load('js/game.js');

const { makeRng, randomSeed } = globalThis.ClutchRng;
const I = globalThis.ClutchGameInternals;

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('RNG');
{
  const r1 = makeRng(42), r2 = makeRng(42);
  const s1 = Array.from({ length: 20 }, () => r1.next());
  const s2 = Array.from({ length: 20 }, () => r2.next());
  check('same seed -> identical sequence', eq(s1, s2));
  const r3 = makeRng(43);
  check('different seed -> different sequence', !eq(s1, Array.from({ length: 20 }, () => r3.next())));
  const r4 = makeRng(7);
  const vals = Array.from({ length: 1000 }, () => r4.next());
  check('values in [0,1)', vals.every(v => v >= 0 && v < 1));
  check('range() stays in bounds', Array.from({ length: 200 }, () => r4.range(5, 9)).every(v => v >= 5 && v < 9));
  check('int() stays in bounds', Array.from({ length: 200 }, () => r4.int(1, 6)).every(v => v >= 1 && v <= 6));
  check('randomSeed returns uint32', Number.isInteger(randomSeed()) && randomSeed() >= 0);
}

console.log('Spawn plan');
{
  const p1 = I.buildPlan(12345);
  const p2 = I.buildPlan(12345);
  check('same seed -> identical plan (duel fairness)', eq(p1, p2));
  const p3 = I.buildPlan(999);
  check('different seed -> different plan', !eq(p1, p3));

  const total = p1.reduce((n, ev) => n + ev.targets.length, 0);
  check('total targets = 15 (1+2+3+4+5)', total === 15, 'got ' + total);

  let structureOk = true;
  I.ROUNDS.forEach((round, ri) => {
    const evs = p1.filter(e => e.round === ri);
    const n = evs.reduce((s, e) => s + e.targets.length, 0);
    if (n !== round.count) structureOk = false;
    let prevAt = -1;
    evs.forEach(e => { if (e.at <= prevAt) structureOk = false; prevAt = e.at; });
    evs.forEach(e => e.targets.forEach(t => {
      if (t.x < 0.10 || t.x > 0.90 || t.y < 0.12 || t.y > 0.88) structureOk = false;
      if (t.radius !== round.radius || t.peek !== round.peek) structureOk = false;
    }));
  });
  check('per-round counts, ordering, bounds, radii, peek windows', structureOk);

  // pair events: split into two single spawns PAIR_STAGGER ms apart
  const r4 = p1.filter(e => e.round === 3);
  const r4gaps = r4.slice(1).map((e, i) => e.at - r4[i].at);
  check('round 4 = 4 events, pairs staggered by 500ms',
    r4.length === 4 && r4gaps.filter(g => g === I.PAIR_STAGGER).length === 2,
    'gaps: ' + JSON.stringify(r4gaps));
  const r5 = p1.filter(e => e.round === 4);
  const r5gaps = r5.slice(1).map((e, i) => e.at - r5[i].at);
  check('round 5 = 5 events, pairs staggered by 500ms',
    r5.length === 5 && r5gaps.filter(g => g === I.PAIR_STAGGER).length === 2,
    'gaps: ' + JSON.stringify(r5gaps));

  // flick distance: consecutive positions are usually far apart
  const positions = [];
  p1.forEach(e => e.targets.forEach(t => positions.push(t)));
  let far = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = (positions[i].y - positions[i - 1].y) * 1.4;
    if (Math.sqrt(dx * dx + dy * dy) > 0.35) far++;
  }
  check('most consecutive targets force a real flick', far >= positions.length - 2, far + '/' + (positions.length - 1));
}

console.log('Scoring');
{
  check('speed bonus <300ms = 150', I.speedBonus(150) === 150);
  check('speed bonus 300-499ms = 75', I.speedBonus(400) === 75);
  check('speed bonus 500-799ms = 25', I.speedBonus(600) === 25);
  check('speed bonus >=800ms = 0', I.speedBonus(800) === 0 && I.speedBonus(1200) === 0);
  check('combo mult x1.0 at combo 1', I.comboMultiplier(1) === 1.0);
  check('combo mult x1.75 at combo 6', I.comboMultiplier(6) === 1.75);
  check('combo mult caps at x2.5', I.comboMultiplier(11) === 2.5 && I.comboMultiplier(50) === 2.5);
  check('hit score: fast flick, no combo = 250', I.scoreForHit(150, 1) === 250);
  check('hit score: mid flick, no combo = 175', I.scoreForHit(400, 1) === 175);
  check('hit score: slow flick, no combo = 125', I.scoreForHit(600, 1) === 125);
  check('hit score: fast flick, combo 11 = 625', I.scoreForHit(150, 11) === 625);
}

console.log('Ranks');
{
  check('0 -> ROOKIE', I.rankFor(0) === 'ROOKIE');
  check('2499 -> ROOKIE', I.rankFor(2499) === 'ROOKIE');
  check('2500 -> RISING', I.rankFor(2500) === 'RISING');
  check('5000 -> PRO', I.rankFor(5000) === 'PRO');
  check('8000 -> ELITE', I.rankFor(8000) === 'ELITE');
  check('11000 -> CHAMPION', I.rankFor(11000) === 'CHAMPION');
  check('20000 -> CHAMPION', I.rankFor(20000) === 'CHAMPION');
}

console.log('Rounds config');
{
  check('5 rounds', I.ROUNDS.length === 5);
  check('peek windows strictly decrease', I.ROUNDS.every((r, i) => i === 0 || r.peek < I.ROUNDS[i - 1].peek));
  check('radii strictly decrease', I.ROUNDS.every((r, i) => i === 0 || r.radius < I.ROUNDS[i - 1].radius));
  check('MAX_HP = 3', I.MAX_HP === 3);
  check('round bonus clean = 200/round', I.ROUND_BONUS_CLEAN === 200);
  check('round bonus survived = 100/round', I.ROUND_BONUS_SURVIVED === 100);
}

console.log('Game timing and input');
{
  let now = 0;
  globalThis.performance = { now: () => now };
  globalThis.window = {
    devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {}
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ClutchSfx = {
    spawn: () => {}, shot: () => {}, hit: () => {}, miss: () => {},
    gameOver: () => {}, victory: () => {}, roundClear: () => {}
  };
  let rect = { left: 10, top: 20, width: 160, height: 120 };
  const canvas = {
    clientWidth: 160, clientHeight: 120,
    getBoundingClientRect: () => rect,
    getContext: () => ({ setTransform: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {}
  };
  const game = new globalThis.ClutchGame(canvas);
  game._render = () => {};
  game.startRun({ seed: 0 });
  check('startRun preserves seed zero and its plan', game.seed === 0 && eq(game.plan, I.buildPlan(0)));

  function target(spawnAt, peek) {
    return { px: 160, py: 120, currentRadius: 30, spawnAt, peek, color: '#fff' };
  }
  function ready() {
    game._resetRun();
    game.state = 'playing';
    game.active = [target(0, 1200)];
  }
  ready();
  now = 1200;
  check('shot at expiry incurs damage and never scores',
    !game.handleShot(160, 120) && game.hp === 2 && game.hits === 0 && game.score === 0);
  ready();
  game.hp = 1;
  now = 1201;
  check('fatal expiry ends run before accepting shot',
    !game.handleShot(160, 120) && game.hp === 0 && game.state === 'over' && game.shots === 0);
  ready();
  game.active = [target(0, 1000), target(500, 1200), target(0, 1000)];
  now = 1000;
  check('all overdue targets expire before a live target can be hit',
    game.handleShot(160, 120) && game.hp === 1 && game.hits === 1 && !game.roundClean);
  [299.6, 499.6, 799.6].forEach((age, i) => {
    ready();
    now = age;
    const expected = [250, 175, 125][i];
    check('raw reaction ' + age + ' uses correct tier and rounded statistic',
      game.handleShot(160, 120) && game.score === expected && game.reactions[0] === Math.round(age));
  });
  [300, 500, 800].forEach((age, i) => {
    ready();
    now = age;
    check('reaction at ' + age + ' uses next tier',
      game.handleShot(160, 120) && game.score === [175, 125, 100][i]);
  });
  ready();
  now = 1199.9;
  check('shot immediately before expiry can score', game.handleShot(160, 120) && game.hp === 3);
  ready();
  game.active = [];
  game.roundStartAt = 100;
  game.plan = [
    { round: 0, at: 600, targets: [{ x: 0.5, y: 0.5, radius: 56, peek: 1700 }] },
    { round: 0, at: 1100, targets: [{ x: 0.6, y: 0.5, radius: 56, peek: 1700 }] }
  ];
  game.planIdx = 0;
  now = 1300;
  game._loop(now);
  check('delayed frame retains scheduled spawn times', eq(game.active.map(t => t.spawnAt), [700, 1200]));
  now = 2400;
  game._loop(now);
  check('delayed frame expires targets using their scheduled spawn times',
    game.hp === 2 && game.active.length === 1 && game.active[0].spawnAt === 1200);
  let resizeCount = 0;
  const resize = game._resize;
  game._resize = function () { resizeCount++; resize.call(game); };
  game._loop(now);
  check('small canvas does not resize every frame', resizeCount === 0);
  game._onPointerMove({ clientX: 90, clientY: 80 });
  check('pointer move maps CSS pixels to logical coordinates', game.mouse.x === 160 && game.mouse.y === 120);
  ready();
  now = 100;
  game._onPointerDown({ clientX: 90, clientY: 80, preventDefault: () => {} });
  check('pointer down hits target on scaled canvas', game.hits === 1);
}

console.log('Canvas reduced motion');
{
  let now = 0, listener = null, removed = null;
  const query = {
    matches: false,
    addEventListener: (type, fn) => { if (type === 'change') listener = fn; },
    removeEventListener: (type, fn) => { if (type === 'change') removed = fn; }
  };
  globalThis.performance = { now: () => now };
  globalThis.window = {
    devicePixelRatio: 1, matchMedia: () => query,
    addEventListener: () => {}, removeEventListener: () => {}
  };
  let arcs = [], texts = [], translations = [], lines = [];
  const ctx = {
    setTransform: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
    beginPath: () => {}, stroke: () => {}, fill: () => {},
    moveTo: (x, y) => lines.push([x, y]), lineTo: () => {},
    translate: (x, y) => translations.push([x, y]),
    arc: (x, y, r) => arcs.push(r),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillText: (text, x, y) => texts.push({ text, x, y, alpha: ctx.globalAlpha })
  };
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
    getContext: () => ctx, addEventListener: () => {}, removeEventListener: () => {}
  };
  const game = new globalThis.ClutchGame(canvas);
  function render(time) {
    arcs = []; texts = []; translations = []; lines = [];
    game._render(time);
  }
  function target() {
    return { px: 160, py: 120, radius: 50, currentRadius: 15,
      spawnAt: 0, peek: 1200, color: '#fff' };
  }
  game.state = 'playing';
  game.active = [target()];
  game.shakeUntil = 1000;
  game._burst(100, 100, '#fff');
  game._popup(100, 100, 'SCORE', '#fff', 20);
  render(30);
  check('normal motion creates particles, moves popups and shakes',
    game.particles.length === 12 && texts[0].y < 100 && translations.length === 1);
  listener({ matches: true });
  check('preference change removes existing particles and popups',
    game.reducedMotion && game.particles.length === 0 && game.popups.length === 0);
  game._burst(100, 100, '#fff');
  game._popup(120, 110, 'NEW', '#fff', 18);
  render(60);
  check('reduced motion suppresses particles, popups and shake',
    game.particles.length === 0 && game.popups.length === 0 && translations.length === 0 && texts.length === 0);
  render(200);
  const rotor = lines.slice(-4);
  render(300);
  check('reduced motion keeps rotor ticks stationary', eq(rotor, lines.slice(-4)));
  [0, 30, 60, 119, 120].forEach(age => {
    game.active = [target()];
    render(age);
    const reducedRadius = arcs[1], hitRadius = game.active[0].currentRadius;
    listener({ matches: false });
    render(age);
    check('visible radius matches unchanged hitbox at age ' + age,
      Math.abs(reducedRadius - hitRadius) < 1e-9 && Math.abs(reducedRadius - arcs[1]) < 1e-9);
    listener({ matches: true });
  });
  function shotAt(reduced, offset) {
    game._resetRun();
    game.state = 'playing';
    game.active = [target()];
    listener({ matches: reduced });
    now = 60;
    render(now);
    return { hit: game.handleShot(160 + offset, 120), score: game.score, hp: game.hp };
  }
  check('hit and miss outcomes are unchanged by reduced motion during growth',
    eq(shotAt(false, 50), shotAt(true, 50)) && eq(shotAt(false, 60), shotAt(true, 60)) &&
    shotAt(true, 50).hit && !shotAt(true, 60).hit);
  listener({ matches: false });
  game._popup(100, 100, 'RESUME', '#fff', 18);
  render(now);
  check('normal motion resumes after preference change', texts[0].y < 100);
  game.destroy();
  check('motion preference listener is removed on destroy', removed === listener);

  query.matches = true;
  const initiallyReduced = new globalThis.ClutchGame(canvas);
  initiallyReduced._burst(100, 100, '#fff');
  initiallyReduced._popup(100, 100, 'INITIAL', '#fff', 18);
  texts = [];
  initiallyReduced._render(0);
  check('initial reduced preference suppresses particles and popups',
    initiallyReduced.reducedMotion && initiallyReduced.particles.length === 0 &&
    initiallyReduced.popups.length === 0 && texts.length === 0);
  initiallyReduced.destroy();

  let legacyListener = null, legacyRemoved = null;
  window.matchMedia = () => ({
    matches: false, addListener: fn => { legacyListener = fn; },
    removeListener: fn => { legacyRemoved = fn; }
  });
  const legacy = new globalThis.ClutchGame(canvas);
  legacyListener({ matches: true });
  legacy.destroy();
  check('legacy motion listener handles changes and is removed',
    legacy.reducedMotion && legacyRemoved === legacyListener);
}

console.log('Leaderboard storage');
{
  const data = {};
  let blockedKey = null;
  globalThis.localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => {
      if (key === blockedKey) throw new Error('storage blocked');
      data[key] = value;
    }
  };
  globalThis.BroadcastChannel = undefined;
  load('js/leaderboard.js');
  const board = window.ClutchBoard;
  const key = 'clutch-arena:board:alltime';
  const valid = { name: 'ACE', score: 100, rounds: 1, acc: 50 };
  data[key] = JSON.stringify([
    valid, null, { name: 7, score: 1, rounds: 1, acc: 1 },
    { name: 'A', score: null, rounds: 1, acc: 1 },
    { name: 'A', score: '100', rounds: 1, acc: 1 },
    { name: 'A', score: '<img src=x>', rounds: 1, acc: 1 },
    { name: 'A', score: 1, rounds: '<img src=x>', acc: 1 },
    { name: 'A', score: 1, rounds: 1, acc: '1' },
    { name: 'A', score: 1, rounds: 1 }
  ]).replace('"<img src=x>"', '1e400');
  check('invalid stored fields and non-finite numbers are discarded', eq(board.allTime(), [valid]));
  check('cleaned leaderboard is persisted', eq(JSON.parse(data[key]), [valid]));
  data[key] = JSON.stringify([valid, { name: 'B', score: null, rounds: 1, acc: 2 }]);
  blockedKey = key;
  check('validation still protects reads if repair fails', eq(board.allTime(), [valid]));
  const progress = {};
  const entry = { name: 'NEW', score: 200, rounds: 2, acc: 80 };
  check('partial storage failure returns false with board status',
    board.add(entry, progress) === false && progress.today === true && progress.allTime === false);
  blockedKey = null;
  check('retry persists both boards without duplicating successful write',
    board.add(entry, progress) === true && board.today().filter(e => e.name === 'NEW').length === 1 &&
    board.allTime().filter(e => e.name === 'NEW').length === 1);

  console.log('Leaderboard tie policy');
  Object.keys(data).forEach(k => { delete data[k]; });
  const canRank = typeof board.rankToday === 'function' && typeof board.rankAllTime === 'function';
  const canFind = typeof board.savedToday === 'function' && typeof board.savedAllTime === 'function';
  check('prospective rank and saved entry APIs are available', canRank && canFind);
  const first = {}, second = {};
  check('empty board gives first place to a positive score', canRank && board.rankToday(100) === 1);
  check('nonpositive and invalid scores do not qualify', canRank &&
    board.rankToday(0) === null && board.rankToday(-1) === null && board.rankToday(NaN) === null);
  board.add(valid, first);
  check('new equal score follows the existing score', canRank && board.rankToday(100) === 2 &&
    board.qualifiesToday(100));
  board.add(valid, second);
  check('identical entries can be identified after saving', canFind &&
    board.savedToday(first).rank === 1 && board.savedToday(second).rank === 2 &&
    board.savedToday(first).entry._boardId !== board.savedToday(second).entry._boardId);
  const higher = {};
  board.add({ name: 'TOP', score: 200, rounds: 1, acc: 50 }, higher);
  check('saved entry lookup returns its current rank after a later insertion', canFind &&
    board.savedToday(second).rank === 3 && board.savedAllTime(second).rank === 3);
  for (let i = 0; i < 7; i++) board.add({ name: 'LOW', score: 50, rounds: 1, acc: 50 }, {});
  check('full board rejects a tie with the cutoff', canRank && board.rankToday(50) === null &&
    board.rankAllTime(50) === null && !board.qualifiesToday(50));
  const cutoff = {};
  check('successful write does not imply cutoff tie was saved', board.add(
    { name: 'TIE', score: 50, rounds: 1, acc: 50 }, cutoff) && canFind &&
    board.savedToday(cutoff) === null && board.savedAllTime(cutoff) === null);
  check('tie above cutoff inserts after equals and displaces last', canRank &&
    board.rankToday(100) === 4 && board.qualifiesToday(100));
  const newTie = {};
  board.add(valid, newTie);
  check('actual saved rank agrees with prospective rank', canFind &&
    board.savedToday(newTie).rank === 4 && board.savedAllTime(newTie).rank === 4 &&
    board.today().length === 10);
  for (let i = 0; i < 10; i++) board.add({ name: 'TOP', score: 300, rounds: 1, acc: 50 }, {});
  check('saved entry lookup returns null when the entry is displaced', canFind &&
    board.savedToday(newTie) === null && board.savedAllTime(newTie) === null);

  Object.keys(data).forEach(k => { delete data[k]; });
  blockedKey = key;
  const retry = {};
  board.add(valid, retry);
  check('saved lookup distinguishes a failed write from a successful one', canFind &&
    board.savedToday(retry).rank === 1 && board.savedAllTime(retry) === null);
  blockedKey = null;
  board.add(valid, retry);
  check('saved lookup survives a partial-write retry without duplicates', canFind &&
    board.savedToday(retry).rank === 1 && board.savedAllTime(retry).rank === 1 &&
    board.today().length === 1 && board.allTime().length === 1);

  const dayKey = retry.dayKey;
  const record = (name, score) => ({ name, score, rounds: 1, acc: 50 });
  data[dayKey] = JSON.stringify([record('LOW', 50), record('ONE', 100), record('TWO', 100)]);
  data[key] = JSON.stringify(Array.from({ length: 10 }, (_, i) => record('ALL', 100 - i)));
  check('prospective rank uses each sorted board and normalized saved scores', canRank &&
    board.rankToday(100.9) === 3 && board.rankAllTime(100.9) === 2 &&
    board.rankToday(0.9) === null && board.rankToday('100') === null);
  const different = {};
  board.add(record('NEW', 100), different);
  check('stored tie order is stable even when original records were unsorted',
    eq(board.today().map(e => e.name), ['ONE', 'TWO', 'NEW', 'LOW']));
  check('the same entry can have different ranks on each board', canFind &&
    board.savedToday(different).rank === 3 && board.savedAllTime(different).rank === 2);
  data[dayKey] = JSON.stringify([different.entry, different.entry]);
  check('duplicate untrusted identifiers are not claimed as a saved entry', canFind &&
    board.savedToday(different) === null);
  const oldDay = 'clutch-arena:board:day:2001-01-02';
  data[oldDay] = JSON.stringify([different.entry]);
  const oldProgress = { entry: different.entry, dayKey: oldDay, today: true };
  check('saved daily entry lookup uses the original save day', canFind &&
    board.savedToday(oldProgress).rank === 1);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
