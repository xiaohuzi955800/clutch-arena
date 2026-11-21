/* Local leaderboard — localStorage only, works fully offline.
   Broadcasts updates to the Booth Display view on the same machine via
   BroadcastChannel (with a storage-event fallback). */
(function (global) {
  'use strict';

  var KEY_ALL = 'clutch-arena:board:alltime';
  var KEY_DAY_PREFIX = 'clutch-arena:board:day:';
  var CHANNEL = 'clutch-arena-board';
  var MAX_ENTRIES = 10;

  var bc = null;
  try { bc = new BroadcastChannel(CHANNEL); } catch (e) { bc = null; }

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return KEY_DAY_PREFIX + d.getFullYear() + '-' + m + '-' + day;
  }

  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr.slice(0, MAX_ENTRIES))); } catch (e) {}
  }

  function sortDesc(arr) {
    return arr.slice().sort(function (a, b) { return b.score - a.score; });
  }

  function qualifies(score, list) {
    if (score <= 0) return false;
    if (list.length < MAX_ENTRIES) return true;
    return score > list[list.length - 1].score;
  }

  var Board = {
    today: function () { return sortDesc(load(todayKey())); },
    allTime: function () { return sortDesc(load(KEY_ALL)); },

    qualifiesToday: function (score) { return qualifies(score, this.today()); },
    qualifiesAllTime: function (score) { return qualifies(score, this.allTime()); },

    add: function (entry) {
      var e = {
        name: (entry.name || 'ACE').toUpperCase().slice(0, 3),
        score: entry.score | 0,
        rounds: entry.rounds | 0,
        acc: Math.round(entry.acc || 0),
        at: Date.now()
      };
      save(todayKey(), sortDesc(load(todayKey()).concat([e])));
      save(KEY_ALL, sortDesc(load(KEY_ALL).concat([e])));
      this.broadcast();
      return e;
    },

    clearAll: function () {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k === KEY_ALL || k.indexOf(KEY_DAY_PREFIX) === 0) localStorage.removeItem(k);
        });
      } catch (e) {}
      this.broadcast();
    },

    broadcast: function () {
      if (bc) { try { bc.postMessage({ type: 'board-updated', at: Date.now() }); } catch (e) {} }
    },

    onUpdate: function (fn) {
      if (bc) bc.onmessage = function (ev) { if (ev.data && ev.data.type === 'board-updated') fn(); };
      window.addEventListener('storage', function (ev) {
        if (ev.key === KEY_ALL || (ev.key && ev.key.indexOf(KEY_DAY_PREFIX) === 0)) fn();
      });
    }
  };

  global.ClutchBoard = Board;
})(window);
