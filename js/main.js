/* Clutch Arena — app wiring: screens, modes, duel flow, attract mode. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // B3: escape names before splicing them into innerHTML
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var game = null;
  var mode = 'solo'; // 'solo' | 'duel' | 'attract'
  var duel = { p1: 'PLAYER 1', p2: 'PLAYER 2', seed: 0, phase: 0, results: [] };
  var lastResult = null;
  var pendingScoreSave = null;
  var attractTimer = null;
  var attractPilot = null;
  var attractSeen = null;

  /* ---------- screens ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
    window.scrollTo(0, 0);
    var messages = {
      'screen-home': 'Home screen.',
      'screen-game': mode === 'attract' ? 'Attract demo.' : 'Game started.',
      'screen-duel-setup': 'Duel setup.',
      'screen-display': 'Booth display.',
      'screen-score': $('score-outcome').textContent + ' Score: ' + $('score-final').textContent + '. ' + $('btn-again').textContent,
      'screen-duel-result': $('duel-winner').textContent
    };
    $('screen-status').textContent = messages[id] || '';
  }

  /* ---------- home ---------- */
  function renderHomeTop5() {
    var list = ClutchBoard.today().slice(0, 5);
    var el = $('home-top5');
    if (!list.length) {
      el.innerHTML = '<li class="empty">No scores yet today — be the first!</li>';
      return;
    }
    el.innerHTML = list.map(function (e, i) {
      return '<li><span>' + (i + 1) + '. <b>' + esc(e.name) + '</b></span><span>' +
        e.score.toLocaleString() + ' pts</span></li>';
    }).join('');
  }

  /* ---------- HUD ---------- */
  var lastLiveAt = 0;
  var lastHud = null;
  var liveHeartbeat = null;
  function broadcastLive(h) {
    // E2: live run state to the Booth Display, throttled to ~2/sec.
    // Attract demos are not broadcast — the bar is for real players.
    if (mode === 'attract') return;
    var now = Date.now();
    if (now - lastLiveAt < 500) return;
    lastLiveAt = now;
    var player = mode === 'duel'
      ? (duel.phase === 0 ? duel.p1 : duel.p2)
      : 'SOLO PLAYER';
    ClutchBoard.broadcastLive({
      player: player, score: h.score, round: h.round + 1,
      roundLabel: h.roundLabel, hp: h.hp, combo: h.combo
    });
  }

  /* E2 heartbeat: HUD updates only fire on hits/misses/round events, so a
     round transition (clearing 1.3s + banner 1.1s) can leave a >3s gap and
     the display's watchdog would flicker the NOW PLAYING bar off and on.
     Re-broadcast the last known state every second while a run is live. */
  function startLiveHeartbeat() {
    stopLiveHeartbeat();
    liveHeartbeat = setInterval(function () {
      if (lastHud) broadcastLive(lastHud);
    }, 1000);
  }
  function stopLiveHeartbeat() {
    if (liveHeartbeat) { clearInterval(liveHeartbeat); liveHeartbeat = null; }
  }

  function updateHud(h) {
    lastHud = h;
    $('hud-score').textContent = h.score.toLocaleString();
    $('hud-round').textContent = h.round + 1;
    $('hud-round-label').textContent = h.roundLabel;
    $('hud-combo').textContent = h.combo >= 2
      ? '🔥 ×' + h.mult.toFixed(1) + ' · ' + h.combo + ' STREAK' : '';
    $('hud-avg').textContent = h.avgReaction ? h.avgReaction + 'ms' : '—';
    $('hud-acc').textContent = h.accuracy !== null ? h.accuracy + '%' : '—';
    var hp = $('hud-hp');
    hp.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var plate = document.createElement('div');
      plate.className = 'hp-plate' + (i < h.hp ? '' : ' lost');
      hp.appendChild(plate);
    }
    broadcastLive(h);
  }

  function showBanner(title, sub) {
    var b = $('round-banner');
    if (!title) { b.classList.add('hidden'); b.textContent = ''; return; }
    b.innerHTML = title + (sub ? '<div class="round-banner sub" style="position:static">' + sub + '</div>' : '');
    b.classList.remove('hidden');
  }

  function flashRed() {
    // E7: no red flash under prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var f = $('flash');
    f.classList.add('on');
    setTimeout(function () { f.classList.remove('on'); }, 450);
  }

  /* ---------- run lifecycle ---------- */
  function startRun(seed) {
    show('screen-game');
    $('duel-indicator').classList.add('hidden');
    if (mode === 'duel') {
      var el = $('duel-indicator');
      el.textContent = (duel.phase === 0 ? '⚔ ' + duel.p1 : '⚔ ' + duel.p2) + ' — DUEL RUN';
      el.classList.remove('hidden');
    }
    game.startRun({ seed: seed });
    startLiveHeartbeat();
  }

  function onGameOver(result) {
    lastResult = result;
    stopLiveHeartbeat();
    if (mode === 'attract') { endAttractRun(); return; }
    ClutchBoard.broadcastLiveEnd(); // E2: run over, display restores boards
    if (mode === 'duel') {
      duel.results[duel.phase] = result;
      if (duel.phase === 0) {
        showScoreScreen(result, true);
      } else {
        showDuelResult();
      }
      return;
    }
    showScoreScreen(result, false);
  }

  /* E3: where this score would sit on today's board (computed before the
     player saves, so it shows the rank they'd take; refreshed after save). */
  function renderTodayRank(score, progress) {
    var el = $('score-today-rank');
    var today = ClutchBoard.today();
    var saved = progress ? ClutchBoard.savedToday(progress) : null;
    var rank = progress
      ? (saved && today[saved.rank - 1] && today[saved.rank - 1]._boardId === saved.entry._boardId ? saved.rank : null)
      : ClutchBoard.rankToday(score);
    if (!today.length && score <= 0) {
      el.innerHTML = '<span class="dim">No scores on today\'s board yet.</span>';
      return;
    }
    if (rank === 1) {
      el.innerHTML = '★ TODAY\'S RANK #1 — YOU\'RE LEADING!';
      return;
    }
    if (rank === null) {
      el.innerHTML = '<span class="dim">Outside today\'s Top 10 — keep playing to climb back!</span>';
      return;
    }
    var gap = today[0].score - score;
    el.innerHTML = 'TODAY\'S RANK #' + rank +
      (gap > 0 ? ' · <span class="dim">' + gap.toLocaleString() + ' PTS BEHIND #1</span>' : '');
  }

  function showScoreScreen(result, isDuelP1) {
    pendingScoreSave = null;
    $('initials-input').disabled = false;
    $('score-save-status').textContent = '';
    $('score-outcome').textContent = result.victory ? '★ ALL 5 ROUNDS CLEARED ★' : 'RUN ENDED';
    $('score-rank').textContent = result.rank;
    $('score-final').textContent = result.score.toLocaleString();
    renderTodayRank(result.score);
    var cells = [
      ['TARGETS HIT', String(result.hits)],
      ['ACCURACY', Math.round(result.accuracy) + '%'],
      ['AVG FLICK', result.avgReaction ? result.avgReaction + 'ms' : '—'],
      ['BEST FLICK', result.bestFlick ? result.bestFlick + 'ms' : '—'],
      ['BEST STREAK', '×' + Math.min(1 + 0.15 * Math.max(result.bestCombo - 1, 0), 2.5).toFixed(2).replace(/0$/, '') + ' · ' + result.bestCombo],
      ['ROUNDS WON', result.roundsWon + ' / 5']
    ];
    $('stats-grid').innerHTML = cells.map(function (c) {
      // E4: sub-250ms best flick earns a PRO-LEVEL badge
      var badge = (c[0] === 'BEST FLICK' && result.bestFlick && result.bestFlick < 250)
        ? '<div class="pro-badge">⚡ PRO-LEVEL</div>' : '';
      return '<div class="stat-cell"><div class="v">' + c[1] + '</div><div class="k">' + c[0] + '</div>' + badge + '</div>';
    }).join('');

    var box = $('initials-box');
    if (!isDuelP1 && (ClutchBoard.qualifiesToday(result.score) || ClutchBoard.qualifiesAllTime(result.score))) {
      box.classList.remove('hidden');
      $('initials-input').value = '';
      // E6: only autofocus on fine-pointer devices (no keyboard popup on touch)
      if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
        setTimeout(function () { $('initials-input').focus(); }, 100);
      }
    } else {
      box.classList.add('hidden');
    }

    var again = $('btn-again');
    again.textContent = isDuelP1 ? '▶ ' + duel.p2 + ' — YOUR TURN' : '↻ PLAY AGAIN';
    show('screen-score');
    armAttract();
  }

  function showDuelResult() {
    var a = duel.results[0], b = duel.results[1];
    var failures = [];
    // E10: record both duel scores automatically (first 3 letters, arcade
    // style). This is the ONLY place duel scores enter the board: P1's score
    // screen never shows the initials box, so there is no double record.
    [0, 1].forEach(function (i) {
      var r = duel.results[i];
      if (r && r.score > 0) {
        var progress = {};
        var saved = ClutchBoard.add({
          name: (i === 0 ? duel.p1 : duel.p2).slice(0, 3),
          score: r.score, rounds: r.roundsWon, acc: r.accuracy
        }, progress);
        if (!saved) {
          failures.push((i === 0 ? duel.p1 : duel.p2) + ': ' + saveFailure(progress));
        }
      }
    });
    $('duel-save-status').textContent = failures.join(' ');
    var tie = a.score === b.score;
    var winner = tie ? -1 : (a.score > b.score ? 0 : 1);
    $('duel-winner').textContent = tie
      ? '🤝 IT\'S A TIE — ' + a.score.toLocaleString() + ' PTS EACH!'
      : '🏆 ' + (winner === 0 ? duel.p1 : duel.p2) + ' WINS!';
    $('duel-compare').innerHTML = [0, 1].map(function (i) {
      var r = duel.results[i];
      var name = i === 0 ? duel.p1 : duel.p2;
      return '<div class="duel-card' + (tie || i === winner ? ' won' : '') + '">' +
        '<div class="n">' + esc(name) + '</div>' +
        '<div class="s">' + r.score.toLocaleString() + '</div>' +
        '<div class="d">Rounds: ' + r.roundsWon + '/5<br>Accuracy: ' + Math.round(r.accuracy) + '%<br>' +
        'Avg flick: ' + (r.avgReaction || '—') + 'ms<br>Rank: ' + r.rank + '</div></div>';
    }).join('');
    show('screen-duel-result');
    armAttract();
  }

  /* ---------- attract mode ---------- */
  var ATTRACT_DELAY = 30000; // ms of idle time before the demo loop starts
  (function () {
    var param = new URLSearchParams(window.location.search).get('attract');
    if (param !== null) {
      var secs = parseInt(param, 10);
      ATTRACT_DELAY = isNaN(secs) ? 30000 : Math.max(0, secs) * 1000;
    }
  })();

  function armAttract() {
    disarmAttract();
    if (ATTRACT_DELAY <= 0) return; // attract=0 disables the demo loop
    attractTimer = setTimeout(startAttract, ATTRACT_DELAY);
  }

  function disarmAttract() {
    if (attractTimer) { clearTimeout(attractTimer); attractTimer = null; }
    if (attractPilot) { clearInterval(attractPilot); attractPilot = null; }
  }

  function startAttract() {
    // never interrupt a run in progress (B2 safety)
    if ($('screen-game').classList.contains('active')) return;
    if ($('screen-duel-setup').classList.contains('active')) {
      mode = 'solo';
      show('screen-home');
      renderHomeTop5();
      armAttract();
      return;
    }
    // B2: idle on the score / duel-result screen — clean reset to home
    // first, then start the demo loop (previously this returned early and
    // the timer was lost, so the booth sat on the score screen forever)
    if (!$('screen-home').classList.contains('active')) {
      mode = 'solo';
      show('screen-home');
      renderHomeTop5();
    }
    document.body.classList.add('attract');
    mode = 'attract';
    attractSeen = null;
    show('screen-game');
    $('duel-indicator').classList.add('hidden');
    game.startRun({ seed: ClutchRng.randomSeed() });
    attractPilot = setInterval(function () {
      var t = game.getActiveTarget();
      if (!t) { attractSeen = null; return; }
      var key = t.x.toFixed(0) + ',' + t.y.toFixed(0);
      var now = performance.now();
      if (!attractSeen || attractSeen.key !== key) {
        attractSeen = { key: key, at: now, delay: 300 + Math.random() * 250, willHit: Math.random() < 0.82 };
        return;
      }
      if (attractSeen.willHit && now - attractSeen.at >= attractSeen.delay) {
        game.handleShot(t.x, t.y);
        attractSeen = null;
      }
    }, 110);
  }

  function endAttractRun() {
    disarmAttract();
    stopLiveHeartbeat();
    document.body.classList.remove('attract');
    mode = 'solo';
    game.quit();
    show('screen-home');
    renderHomeTop5();
    armAttract();
  }

  function exitAttractOnInput() {
    if (mode !== 'attract') return;
    endAttractRun();
  }

  /* ---------- init ---------- */
  function init() {
    var scoreStatus = document.createElement('div');
    scoreStatus.id = 'score-save-status';
    scoreStatus.setAttribute('role', 'status');
    $('initials-box').appendChild(scoreStatus);
    var duelStatus = document.createElement('div');
    duelStatus.id = 'duel-save-status';
    duelStatus.setAttribute('role', 'status');
    $('duel-compare').parentNode.insertBefore(duelStatus, $('duel-compare').nextSibling);

    game = new ClutchGame($('arena'), {
      onHud: updateHud,
      onBanner: showBanner,
      onGameOver: onGameOver,
      onPlayerShot: flashRed
    });

    // home
    $('btn-solo').addEventListener('click', function () {
      ClutchSfx.unlock(); ClutchSfx.click();
      mode = 'solo'; disarmAttract(); startRun();
    });
    $('btn-duel').addEventListener('click', function () {
      ClutchSfx.unlock(); ClutchSfx.click();
      disarmAttract(); show('screen-duel-setup');
      armAttract();
    });
    $('btn-display').addEventListener('click', function () {
      ClutchSfx.click(); disarmAttract();
      show('screen-display'); ClutchDisplay.start();
    });

    // game
    $('btn-quit').addEventListener('click', function () {
      game.quit(); mode = 'solo'; stopLiveHeartbeat(); ClutchBoard.broadcastLiveEnd();
      show('screen-home'); renderHomeTop5(); armAttract();
    });
    $('btn-sound').addEventListener('click', function () {
      var on = !ClutchSfx.isEnabled();
      ClutchSfx.setEnabled(on);
      this.textContent = on ? '🔊 SOUND ON' : '🔇 SOUND OFF';
      this.setAttribute('aria-pressed', String(on));
    });
    $('btn-sound').setAttribute('aria-pressed', String(ClutchSfx.isEnabled()));

    // score
    $('btn-again').addEventListener('click', function () {
      ClutchSfx.unlock(); ClutchSfx.click();
      disarmAttract(); // B2: a fresh run must not be interrupted by the idle timer
      if (mode === 'duel' && duel.phase === 0) {
        duel.phase = 1;
        startRun(duel.seed);
      } else {
        mode = 'solo';
        startRun();
      }
    });
    $('btn-result-card').addEventListener('click', function () {
      ClutchSfx.click();
      downloadResultCard();
    });
    $('btn-home').addEventListener('click', function () {
      mode = 'solo'; show('screen-home'); renderHomeTop5(); armAttract();
    });
    $('btn-save-score').addEventListener('click', saveScore);
    $('initials-input').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') saveScore();
    });

    // duel setup
    $('btn-duel-start').addEventListener('click', function () {
      ClutchSfx.click();
      duel.p1 = ($('duel-p1').value.trim() || 'PLAYER 1').toUpperCase().slice(0, 10);
      duel.p2 = ($('duel-p2').value.trim() || 'PLAYER 2').toUpperCase().slice(0, 10);
      duel.seed = ClutchRng.randomSeed();
      duel.phase = 0;
      duel.results = [];
      mode = 'duel';
      disarmAttract();
      startRun(duel.seed);
    });
    $('btn-duel-back').addEventListener('click', function () {
      show('screen-home'); armAttract();
    });

    // duel result
    $('btn-duel-rematch').addEventListener('click', function () {
      ClutchSfx.unlock(); ClutchSfx.click();
      disarmAttract(); // B2: same idle-timer hazard as btn-again
      duel.seed = ClutchRng.randomSeed();
      duel.phase = 0;
      duel.results = [];
      mode = 'duel';
      startRun(duel.seed);
    });
    $('btn-duel-home').addEventListener('click', function () {
      mode = 'solo'; show('screen-home'); renderHomeTop5(); armAttract();
    });

    // display
    $('btn-display-home').addEventListener('click', function () {
      cancelResetHold();
      mode = 'solo'; show('screen-home'); renderHomeTop5(); armAttract();
    });
    $('btn-display-play').addEventListener('click', function () {
      ClutchSfx.unlock(); ClutchSfx.click();
      cancelResetHold();
      mode = 'solo'; disarmAttract(); startRun();
    });
    var resetHold = null;
    var resetPointer = null;
    var resetMessage = null;
    var resetConfirm = null;
    var resetBtn = $('btn-display-reset');
    function cancelResetHold() {
      if (resetHold !== null) { clearTimeout(resetHold); resetHold = null; }
      if (resetConfirm !== null) { clearTimeout(resetConfirm); resetConfirm = null; }
      resetPointer = null;
      resetBtn.textContent = 'RESET BOARDS (hold 2s)';
    }
    resetBtn.addEventListener('pointerdown', function (ev) {
      if (resetPointer !== null || ev.button !== 0) return;
      if (resetConfirm !== null) { clearTimeout(resetConfirm); resetConfirm = null; }
      resetPointer = ev.pointerId;
      if (resetMessage !== null) { clearTimeout(resetMessage); resetMessage = null; }
      resetBtn.textContent = 'HOLD TO CONFIRM…';
      resetHold = setTimeout(function () {
        resetHold = null;
        ClutchBoard.clearAll();
        ClutchDisplay.refresh();
        resetBtn.textContent = 'BOARDS CLEARED ✓';
        resetMessage = setTimeout(function () {
          resetMessage = null;
          resetBtn.textContent = 'RESET BOARDS (hold 2s)';
        }, 2000);
      }, 2000);
    });
    ['pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
      resetBtn.addEventListener(ev, function (event) {
        if (event.pointerId !== resetPointer) return;
        cancelResetHold();
      });
    });
    function confirmReset() {
      if (resetPointer !== null) return;
      if (resetMessage !== null) { clearTimeout(resetMessage); resetMessage = null; }
      if (resetConfirm !== null) {
        clearTimeout(resetConfirm);
        resetConfirm = null;
        ClutchBoard.clearAll();
        ClutchDisplay.refresh();
        resetBtn.textContent = 'BOARDS CLEARED ✓';
        resetMessage = setTimeout(function () {
          resetMessage = null;
          resetBtn.textContent = 'RESET BOARDS (hold 2s)';
        }, 2000);
      } else {
        resetBtn.textContent = 'PRESS ENTER AGAIN TO CONFIRM';
        resetConfirm = setTimeout(function () {
          resetConfirm = null;
          resetBtn.textContent = 'RESET BOARDS (hold 2s)';
        }, 3000);
      }
    }
    resetBtn.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && resetConfirm !== null) {
        ev.preventDefault();
        cancelResetHold();
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (!ev.repeat) confirmReset();
      }
    });
    resetBtn.addEventListener('click', function (ev) {
      if (ev.detail === 0) confirmReset();
    });
    window.addEventListener('blur', cancelResetHold);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cancelResetHold();
    });

    // keyboard shortcuts
    document.addEventListener('keydown', function (ev) {
      if (mode === 'attract') { exitAttractOnInput(); return; }
      resetIdleOnActivity();
      if (ev.key === 'Escape' && $('screen-game').classList.contains('active')) {
        game.quit(); mode = 'solo'; stopLiveHeartbeat(); ClutchBoard.broadcastLiveEnd();
        show('screen-home'); renderHomeTop5(); armAttract();
      } else if (ev.key === 'Enter' && !ev.defaultPrevented && $('screen-home').classList.contains('active') &&
          !(ev.target.closest && ev.target.closest('button, input, select, textarea, a[href], summary, [contenteditable], [role="button"], [role="link"]'))) {
        ClutchSfx.unlock(); ClutchSfx.click();
        mode = 'solo'; disarmAttract(); startRun();
      }
    });

    function resetIdleOnActivity() {
      if ($('screen-home').classList.contains('active') || $('screen-score').classList.contains('active') ||
          $('screen-duel-result').classList.contains('active') || $('screen-duel-setup').classList.contains('active')) {
        armAttract();
      }
    }
    // Activity on idle screens postpones the demo; an active run is never interrupted.
    document.addEventListener('pointerdown', function () {
      if (mode === 'attract') { exitAttractOnInput(); return; }
      resetIdleOnActivity();
    });
    document.addEventListener('pointermove', resetIdleOnActivity);
    document.addEventListener('input', resetIdleOnActivity);

    // direct display link for the second monitor
    if (new URLSearchParams(window.location.search).get('display') === '1') {
      show('screen-display');
      ClutchDisplay.start();
    } else {
      renderHomeTop5();
      armAttract();
    }
  }

  /* E1: shareable result card — drawn on an offscreen canvas, downloaded
     as PNG. No QR (zero-dependency constraint); the game URL is printed
     as text on the card. */
  function downloadResultCard() {
    if (!lastResult) return;
    var r = lastResult;
    var c = document.createElement('canvas');
    c.width = 760; c.height = 420;
    var x = c.getContext('2d');
    // background
    var bg = x.createLinearGradient(0, 0, 0, 420);
    bg.addColorStop(0, '#12233f'); bg.addColorStop(1, '#070b16');
    x.fillStyle = bg; x.fillRect(0, 0, 760, 420);
    x.strokeStyle = '#22d3ee'; x.lineWidth = 4;
    x.strokeRect(10, 10, 740, 400);
    // header
    x.textAlign = 'center';
    x.fillStyle = '#94a3b8';
    x.font = '700 17px "Segoe UI", Arial, sans-serif';
    x.fillText('CLOUD9 × JETBRAINS · SKY\'S THE LIMIT 2026', 380, 48);
    x.fillStyle = '#ffffff';
    x.font = '900 54px "Segoe UI", Arial, sans-serif';
    x.fillText('CLUTCH ARENA', 380, 108);
    // rank + score
    var grad = x.createLinearGradient(180, 0, 580, 0);
    grad.addColorStop(0, '#fbbf24'); grad.addColorStop(1, '#f472b6');
    x.fillStyle = grad;
    x.font = '900 44px "Segoe UI", Arial, sans-serif';
    x.fillText(r.rank, 380, 168);
    x.fillStyle = '#ffffff';
    x.font = '900 72px "Segoe UI", Arial, sans-serif';
    x.fillText(r.score.toLocaleString() + ' PTS', 380, 248);
    // stats line
    x.fillStyle = '#22d3ee';
    x.font = '700 22px "Segoe UI", Arial, sans-serif';
    x.fillText('BEST FLICK ' + (r.bestFlick ? r.bestFlick + 'ms' : '—') +
      '   ·   ACCURACY ' + Math.round(r.accuracy) + '%' +
      '   ·   ROUNDS ' + r.roundsWon + '/5', 380, 300);
    if (r.bestFlick && r.bestFlick < 250) {
      x.fillStyle = '#fbbf24';
      x.font = '900 22px "Segoe UI", Arial, sans-serif';
      x.fillText('⚡ PRO-LEVEL FLICK', 380, 334);
    }
    // footer: date + URL
    x.fillStyle = '#94a3b8';
    x.font = '400 18px "Segoe UI", Arial, sans-serif';
    var d = new Date();
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
    x.fillText(ds + '   ·   xiaohuzi955800.github.io/clutch-arena', 380, 382);
    // download
    var a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'clutch-arena-' + r.score + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function saveFailure(saved) {
    var boards = !saved.today && !saved.allTime ? 'today and all-time boards' :
      (!saved.today ? 'today\'s board' : 'the all-time board');
    return 'Could not save to ' + boards + '.';
  }

  function saveScore() {
    if (!lastResult) return;
    var name = ($('initials-input').value.trim() || 'ACE').toUpperCase().slice(0, 3);
    var progress = pendingScoreSave || {};
    var saved = ClutchBoard.add({
      name: name, score: lastResult.score,
      rounds: lastResult.roundsWon, acc: lastResult.accuracy
    }, progress);
    if (!saved) {
      pendingScoreSave = progress.today || progress.allTime ? progress : null;
      $('initials-input').disabled = !!pendingScoreSave;
      $('score-save-status').textContent = saveFailure(progress) + ' Please retry.';
      return;
    }
    pendingScoreSave = null;
    $('score-save-status').textContent = '';
    $('initials-box').classList.add('hidden');
    ClutchSfx.roundClear();
    renderHomeTop5();
    renderTodayRank(lastResult.score, progress);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
