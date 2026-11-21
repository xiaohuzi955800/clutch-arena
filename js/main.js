/* Clutch Arena — app wiring: screens, modes, duel flow, attract mode. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var game = null;
  var mode = 'solo'; // 'solo' | 'duel' | 'attract'
  var duel = { p1: 'PLAYER 1', p2: 'PLAYER 2', seed: 0, phase: 0, results: [] };
  var lastResult = null;
  var attractTimer = null;
  var attractPilot = null;
  var attractSeen = null;

  /* ---------- screens ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
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
      return '<li><span>' + (i + 1) + '. <b>' + e.name + '</b></span><span>' +
        e.score.toLocaleString() + ' pts</span></li>';
    }).join('');
  }

  /* ---------- HUD ---------- */
  function updateHud(h) {
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
  }

  function showBanner(title, sub) {
    var b = $('round-banner');
    if (!title) { b.classList.add('hidden'); b.textContent = ''; return; }
    b.innerHTML = title + (sub ? '<div class="round-banner sub" style="position:static">' + sub + '</div>' : '');
    b.classList.remove('hidden');
  }

  function flashRed() {
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
  }

  function onGameOver(result) {
    lastResult = result;
    if (mode === 'attract') { endAttractRun(); return; }
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

  function showScoreScreen(result, isDuelP1) {
    $('score-outcome').textContent = result.victory ? '★ ALL 5 ROUNDS CLEARED ★' : 'RUN ENDED';
    $('score-rank').textContent = result.rank;
    $('score-final').textContent = result.score.toLocaleString();
    var cells = [
      ['TARGETS HIT', String(result.hits)],
      ['ACCURACY', Math.round(result.accuracy) + '%'],
      ['AVG FLICK', result.avgReaction ? result.avgReaction + 'ms' : '—'],
      ['BEST FLICK', result.bestFlick ? result.bestFlick + 'ms' : '—'],
      ['BEST STREAK', '×' + Math.min(1 + 0.1 * Math.max(result.bestCombo - 1, 0), 2.0).toFixed(1) + ' · ' + result.bestCombo],
      ['ROUNDS WON', result.roundsWon + ' / 5']
    ];
    $('stats-grid').innerHTML = cells.map(function (c) {
      return '<div class="stat-cell"><div class="v">' + c[1] + '</div><div class="k">' + c[0] + '</div></div>';
    }).join('');

    var box = $('initials-box');
    if (!isDuelP1 && (ClutchBoard.qualifiesToday(result.score) || ClutchBoard.qualifiesAllTime(result.score))) {
      box.classList.remove('hidden');
      $('initials-input').value = '';
      setTimeout(function () { $('initials-input').focus(); }, 100);
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
    var tie = a.score === b.score;
    var winner = tie ? -1 : (a.score > b.score ? 0 : 1);
    $('duel-winner').textContent = tie
      ? '🤝 IT\'S A TIE — ' + a.score.toLocaleString() + ' PTS EACH!'
      : '🏆 ' + (winner === 0 ? duel.p1 : duel.p2) + ' WINS!';
    $('duel-compare').innerHTML = [0, 1].map(function (i) {
      var r = duel.results[i];
      var name = i === 0 ? duel.p1 : duel.p2;
      return '<div class="duel-card' + (tie || i === winner ? ' won' : '') + '">' +
        '<div class="n">' + name + '</div>' +
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
    if (!$('screen-home').classList.contains('active')) return;
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
    });
    $('btn-display').addEventListener('click', function () {
      ClutchSfx.click(); disarmAttract();
      show('screen-display'); ClutchDisplay.start();
    });

    // game
    $('btn-quit').addEventListener('click', function () {
      game.quit(); mode = 'solo'; show('screen-home'); renderHomeTop5(); armAttract();
    });
    $('btn-sound').addEventListener('click', function () {
      var on = !ClutchSfx.isEnabled();
      ClutchSfx.setEnabled(on);
      this.textContent = on ? '🔊 SOUND ON' : '🔇 SOUND OFF';
    });

    // score
    $('btn-again').addEventListener('click', function () {
      ClutchSfx.click();
      if (mode === 'duel' && duel.phase === 0) {
        duel.phase = 1;
        startRun(duel.seed);
      } else {
        mode = 'solo';
        startRun();
      }
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
      startRun(duel.seed);
    });
    $('btn-duel-back').addEventListener('click', function () {
      show('screen-home'); armAttract();
    });

    // duel result
    $('btn-duel-rematch').addEventListener('click', function () {
      ClutchSfx.click();
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
      mode = 'solo'; show('screen-home'); renderHomeTop5(); armAttract();
    });
    $('btn-display-play').addEventListener('click', function () {
      mode = 'solo'; disarmAttract(); startRun();
    });
    var resetHold = null;
    var resetBtn = $('btn-display-reset');
    resetBtn.addEventListener('pointerdown', function () {
      resetBtn.textContent = 'HOLD TO CONFIRM…';
      resetHold = setTimeout(function () {
        ClutchBoard.clearAll();
        ClutchDisplay.refresh();
        resetBtn.textContent = 'BOARDS CLEARED ✓';
        setTimeout(function () { resetBtn.textContent = 'RESET BOARDS (hold 2s)'; }, 2000);
      }, 2000);
    });
    ['pointerup', 'pointerleave'].forEach(function (ev) {
      resetBtn.addEventListener(ev, function () {
        if (resetHold) { clearTimeout(resetHold); resetHold = null; }
        resetBtn.textContent = 'RESET BOARDS (hold 2s)';
      });
    });

    // keyboard shortcuts
    document.addEventListener('keydown', function (ev) {
      if (mode === 'attract') { exitAttractOnInput(); return; }
      if (ev.key === 'Escape' && $('screen-game').classList.contains('active')) {
        game.quit(); mode = 'solo'; show('screen-home'); renderHomeTop5(); armAttract();
      } else if (ev.key === 'Enter' && $('screen-home').classList.contains('active')) {
        mode = 'solo'; disarmAttract(); startRun();
      }
    });

    // any pointer activity exits attract mode / resets idle timer
    document.addEventListener('pointerdown', function () {
      if (mode === 'attract') { exitAttractOnInput(); return; }
      if ($('screen-home').classList.contains('active')) armAttract();
    });

    // direct display link for the second monitor
    if (new URLSearchParams(window.location.search).get('display') === '1') {
      show('screen-display');
      ClutchDisplay.start();
    } else {
      renderHomeTop5();
      armAttract();
    }
  }

  function saveScore() {
    if (!lastResult) return;
    var name = ($('initials-input').value.trim() || 'ACE').toUpperCase().slice(0, 3);
    ClutchBoard.add({
      name: name, score: lastResult.score,
      rounds: lastResult.roundsWon, acc: lastResult.accuracy
    });
    $('initials-box').classList.add('hidden');
    ClutchSfx.roundClear();
    renderHomeTop5();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
