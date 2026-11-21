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
  check('round 4 = 4 events, pairs staggered by 350ms',
    r4.length === 4 && r4gaps.filter(g => g === I.PAIR_STAGGER).length === 2,
    'gaps: ' + JSON.stringify(r4gaps));
  const r5 = p1.filter(e => e.round === 4);
  const r5gaps = r5.slice(1).map((e, i) => e.at - r5[i].at);
  check('round 5 = 5 events, pairs staggered by 350ms',
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
  check('speed bonus <300ms = 100', I.speedBonus(150) === 100);
  check('speed bonus 300-499ms = 50', I.speedBonus(400) === 50);
  check('speed bonus >=500ms = 0', I.speedBonus(500) === 0 && I.speedBonus(900) === 0);
  check('combo mult x1.0 at combo 1', I.comboMultiplier(1) === 1.0);
  check('combo mult x1.5 at combo 6', I.comboMultiplier(6) === 1.5);
  check('combo mult caps at x2.0', I.comboMultiplier(11) === 2.0 && I.comboMultiplier(50) === 2.0);
  check('hit score: fast flick, no combo = 200', I.scoreForHit(150, 1) === 200);
  check('hit score: slow flick, no combo = 100', I.scoreForHit(600, 1) === 100);
  check('hit score: fast flick, combo 11 = 400', I.scoreForHit(150, 11) === 400);
}

console.log('Ranks');
{
  check('0 -> ROOKIE', I.rankFor(0) === 'ROOKIE');
  check('1499 -> ROOKIE', I.rankFor(1499) === 'ROOKIE');
  check('1500 -> RISING', I.rankFor(1500) === 'RISING');
  check('3000 -> PRO', I.rankFor(3000) === 'PRO');
  check('5000 -> ELITE', I.rankFor(5000) === 'ELITE');
  check('7500 -> CHAMPION', I.rankFor(7500) === 'CHAMPION');
  check('20000 -> CHAMPION', I.rankFor(20000) === 'CHAMPION');
}

console.log('Rounds config');
{
  check('5 rounds', I.ROUNDS.length === 5);
  check('peek windows strictly decrease', I.ROUNDS.every((r, i) => i === 0 || r.peek < I.ROUNDS[i - 1].peek));
  check('radii strictly decrease', I.ROUNDS.every((r, i) => i === 0 || r.radius < I.ROUNDS[i - 1].radius));
  check('MAX_HP = 3', I.MAX_HP === 3);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
