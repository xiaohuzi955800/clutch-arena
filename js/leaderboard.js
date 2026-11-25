/* Local leaderboard — localStorage only, works fully offline.
   Broadcasts updates to the Booth Display view on the same machine via
   BroadcastChannel (with a storage-event fallback). */
(function (global) {
  'use strict';

  var KEY_ALL = 'clutch-arena:board:alltime';
  var KEY_DAY_PREFIX = 'clutch-arena:board:day:';
  var CHANNEL = 'clutch-arena-board';
  var MAX_ENTRIES = 10;
  var entrySequence = 0;
  var entryPrefix = makeEntryPrefix();

  function makeEntryPrefix() {
    try {
      var words = new Uint32Array(4);
      global.crypto.getRandomValues(words);
      return Array.prototype.map.call(words, function (word) { return word.toString(36); }).join('-');
    } catch (e) {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
  }

  var bc = null;
  try { bc = new BroadcastChannel(CHANNEL); } catch (e) { bc = null; }

  // One dispatcher for all channel message types so board-updated and
  // live-update/live-end subscriptions can coexist (E2).
  var updateFns = [];
  var liveFns = [];
  if (bc) {
    bc.onmessage = function (ev) {
      if (!ev.data) return;
      if (ev.data.type === 'board-updated') {
        updateFns.forEach(function (fn) { fn(); });
      } else if (ev.data.type === 'live-update' || ev.data.type === 'live-end') {
        liveFns.forEach(function (fn) { fn(ev.data); });
      }
    };
  }

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return KEY_DAY_PREFIX + d.getFullYear() + '-' + m + '-' + day;
  }

  function validRecord(entry) {
    return entry && typeof entry === 'object' && typeof entry.name === 'string' &&
      typeof entry.score === 'number' && isFinite(entry.score) &&
      typeof entry.rounds === 'number' && isFinite(entry.rounds) &&
      typeof entry.acc === 'number' && isFinite(entry.acc);
  }

  function readBoard(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return { entries: [], ok: true };
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return { entries: [], ok: false };
      var filtered = arr.filter(validRecord);
      if (filtered.length !== arr.length) {
        try { localStorage.setItem(key, JSON.stringify(filtered)); } catch (e) {}
      }
      return { entries: filtered, ok: true };
    } catch (e) { return { entries: [], ok: false }; }
  }

  function load(key) {
    return readBoard(key).entries;
  }

  function save(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr.slice(0, MAX_ENTRIES)));
      return true;
    } catch (e) { return false; }
  }

  function addToBoard(key, entry) {
    var board = readBoard(key);
    return board.ok && save(key, sortDesc(board.entries.concat([entry])));
  }

  function sortDesc(arr) {
    return arr.map(function (entry, index) { return { entry: entry, index: index }; })
      .sort(function (a, b) { return b.entry.score - a.entry.score || a.index - b.index; })
      .map(function (item) { return item.entry; });
  }

  function prospectiveRank(score, list) {
    if (typeof score !== 'number' || !isFinite(score)) return null;
    score = score | 0;
    if (score <= 0) return null;
    var rank = 1;
    list.forEach(function (entry) { if (entry.score >= score) rank++; });
    return rank <= MAX_ENTRIES ? rank : null;
  }

  function savedEntry(key, progress, saved) {
    if (!saved || !progress.entry || typeof progress.entry._boardId !== 'string') return null;
    var id = progress.entry._boardId;
    var list = sortDesc(load(key)).slice(0, MAX_ENTRIES);
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i]._boardId === id) {
        if (found) return null;
        found = { entry: list[i], rank: i + 1 };
      }
    }
    return found;
  }

  var Board = {
    today: function () { return sortDesc(load(todayKey())); },
    allTime: function () { return sortDesc(load(KEY_ALL)); },

    rankToday: function (score) { return prospectiveRank(score, this.today()); },
    rankAllTime: function (score) { return prospectiveRank(score, this.allTime()); },
    qualifiesToday: function (score) { return this.rankToday(score) !== null; },
    qualifiesAllTime: function (score) { return this.rankAllTime(score) !== null; },

    savedToday: function (progress) {
      if (!progress || typeof progress.dayKey !== 'string' ||
          !/^clutch-arena:board:day:\d{4}-\d{2}-\d{2}$/.test(progress.dayKey)) return null;
      return savedEntry(progress.dayKey, progress, progress.today);
    },
    savedAllTime: function (progress) {
      return progress ? savedEntry(KEY_ALL, progress, progress.allTime) : null;
    },

    add: function (entry, previous) {
      var e = previous && previous.entry ? previous.entry : {
        name: (entry.name || 'ACE').toUpperCase().slice(0, 3),
        score: entry.score | 0,
        rounds: entry.rounds | 0,
        acc: Math.round(entry.acc || 0),
        at: Date.now(),
        _boardId: entryPrefix + '-' + (++entrySequence)
      };
      var dayKey = previous && previous.dayKey ? previous.dayKey : todayKey();
      var today = previous && previous.today ? true : addToBoard(dayKey, e);
      var allTime = previous && previous.allTime ? true : addToBoard(KEY_ALL, e);
      if (today || allTime) this.broadcast();
      if (previous) {
        previous.entry = e;
        previous.dayKey = dayKey;
        previous.today = today;
        previous.allTime = allTime;
      }
      return today && allTime;
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

    // E2: live run state for the Booth Display's NOW PLAYING bar.
    // Throttled by the sender (~2/sec); best-effort, no storage fallback.
    broadcastLive: function (state) {
      if (!bc) return;
      try { bc.postMessage(Object.assign({ type: 'live-update', at: Date.now() }, state)); } catch (e) {}
    },

    broadcastLiveEnd: function () {
      if (!bc) return;
      try { bc.postMessage({ type: 'live-end', at: Date.now() }); } catch (e) {}
    },

    onUpdate: function (fn) {
      updateFns.push(fn);
      window.addEventListener('storage', function (ev) {
        if (ev.key === KEY_ALL || (ev.key && ev.key.indexOf(KEY_DAY_PREFIX) === 0)) fn();
      });
    },

    onLive: function (fn) { liveFns.push(fn); }
  };

  global.ClutchBoard = Board;
})(window);
