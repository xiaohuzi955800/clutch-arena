/* Booth Display — big-screen leaderboard view for a second monitor.
   Updates live when a run is saved (BroadcastChannel / storage events).
   Fully offline: reads localStorage only. */
(function (global) {
  'use strict';

  var TIPS = [
    'TIP: Faster flicks score more — under 300ms earns the max speed bonus.',
    'TIP: Streaks build your multiplier up to ×2.5. Don\'t miss!',
    'TIP: A full run takes about 30 seconds. Beat the daily champion!',
    'TIP: Duel Mode — two players, one identical clutch. Higher score wins.',
    'TIP: Targets shrink and speed up every round. Stay sharp.',
    'TIP: Your best flick time is tracked — pros average under 200ms.'
  ];

  var tipIdx = 0;
  var clockTimer = null;
  var tipTimer = null;
  var started = false;
  var liveWatchdog = null;
  var boardDate = null;

  /* E2: NOW PLAYING bar — shows live run state broadcast by the game tab.
     Hides again when the run ends, or if no update arrives for 6s (the game
     tab closed mid-run), so a stale bar never sticks on screen. The 6s
     window (plus the game tab's 1s heartbeat) covers round transitions,
     which used to flicker the bar with a 3s watchdog. */
  function showLive(state) {
    var bar = document.getElementById('display-live');
    if (!bar) return;
    var hp = '';
    for (var i = 0; i < 3; i++) hp += i < state.hp ? '♥' : '♡';
    bar.innerHTML = '<span class="live-dot"></span>NOW PLAYING — ' + esc(state.player || 'PLAYER') +
      ' · ROUND ' + state.round + '/5 ' + esc(state.roundLabel || '') +
      ' · ' + Number(state.score || 0).toLocaleString() + ' PTS · ' + hp;
    bar.classList.remove('hidden');
    if (liveWatchdog) clearTimeout(liveWatchdog);
    liveWatchdog = setTimeout(hideLive, 6000);
  }

  function hideLive() {
    var bar = document.getElementById('display-live');
    if (bar) bar.classList.add('hidden');
    if (liveWatchdog) { clearTimeout(liveWatchdog); liveWatchdog = null; }
  }

  function onLiveMessage(msg) {
    if (!msg) return;
    if (msg.type === 'live-update') showLive(msg);
    else if (msg.type === 'live-end') hideLive();
  }

  function localDate(date) {
    return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
  }

  function renderBoards() {
    var date = localDate(new Date());
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
    boardDate = date;
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
    var now = new Date();
    var el = document.getElementById('display-clock');
    if (el) el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (localDate(now) !== boardDate) renderBoards();
  }

  function onVisibilityChange() {
    if (!document.hidden) tickClock();
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
        ClutchBoard.onLive(onLiveMessage);
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pageshow', tickClock);
        clockTimer = setInterval(tickClock, 10000);
        tipTimer = setInterval(rotateTip, 8000);
      }
    },
    refresh: renderBoards
  };

  global.ClutchDisplay = Display;
})(window);
