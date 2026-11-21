/* Booth Display — big-screen leaderboard view for a second monitor.
   Updates live when a run is saved (BroadcastChannel / storage events).
   Fully offline: reads localStorage only. */
(function (global) {
  'use strict';

  var TIPS = [
    'TIP: Faster flicks score more — under 200ms earns a speed bonus.',
    'TIP: Streaks build your multiplier up to ×2.0. Don\'t miss!',
    'TIP: A full run takes under 2 minutes. Beat the daily champion!',
    'TIP: Duel Mode — two players, one identical clutch. Higher score wins.',
    'TIP: Targets shrink and speed up every round. Stay sharp.',
    'TIP: Your best flick time is tracked — pros average under 200ms.'
  ];

  var tipIdx = 0;
  var clockTimer = null;
  var tipTimer = null;
  var started = false;

  function renderBoards() {
    var today = ClutchBoard.today();
    var all = ClutchBoard.allTime();
    renderList(document.getElementById('display-today'), today);
    renderList(document.getElementById('display-alltime'), all);
    var champ = document.getElementById('display-champ');
    if (today.length) {
      champ.textContent = '👑 TODAY\'S CHAMPION: ' + today[0].name + ' — ' +
        today[0].score.toLocaleString() + ' PTS';
    } else {
      champ.textContent = 'NO SCORES YET TODAY — BE THE FIRST CHAMPION';
    }
  }

  function renderList(el, list) {
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<li class="empty">No scores yet — step up and play!</li>';
      return;
    }
    el.innerHTML = list.map(function (e, i) {
      return '<li><span><span class="r">' + (i + 1) + '.</span><b>' + esc(e.name) +
        '</b></span><span>' + e.score.toLocaleString() + ' <small style="color:var(--muted)">· R' +
        e.rounds + '</small></span></li>';
    }).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tickClock() {
    var el = document.getElementById('display-clock');
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function rotateTip() {
    var el = document.getElementById('display-tip');
    if (el) el.textContent = TIPS[tipIdx % TIPS.length];
    tipIdx++;
  }

  var Display = {
    start: function () {
      renderBoards();
      tickClock();
      rotateTip();
      if (!started) {
        started = true;
        ClutchBoard.onUpdate(renderBoards);
        clockTimer = setInterval(tickClock, 10000);
        tipTimer = setInterval(rotateTip, 8000);
      }
    },
    refresh: renderBoards
  };

  global.ClutchDisplay = Display;
})(window);
