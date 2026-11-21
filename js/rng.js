/* Seeded RNG (mulberry32) — deterministic target sequences so Duel Mode
   can give both players the exact same clutch. */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    var next = mulberry32(seed);
    return {
      next: next,
      // float in [min, max)
      range: function (min, max) { return min + next() * (max - min); },
      // int in [min, max]
      int: function (min, max) { return Math.floor(min + next() * (max - min + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  function randomSeed() {
    return Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
  }

  global.ClutchRng = { makeRng: makeRng, randomSeed: randomSeed };
})(typeof window !== 'undefined' ? window : globalThis);
