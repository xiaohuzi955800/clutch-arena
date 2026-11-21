/* Clutch Arena — game engine.
   Solo clutch run: 5 rounds (1v1 → 1v5). Targets peek from cover; click them
   before their peek window expires or they shoot you. Seeded spawn plans make
   Duel Mode fair: both players face the exact same sequence. */
(function (global) {
  'use strict';

  var ROUNDS = [
    { label: '1v1', count: 1, peek: 1400, radius: 52, gap: 900, pairs: 0 },
    { label: '1v2', count: 2, peek: 1200, radius: 48, gap: 850, pairs: 0 },
    { label: '1v3', count: 3, peek: 1000, radius: 44, gap: 800, pairs: 1 },
    { label: '1v4', count: 4, peek: 950, radius: 42, gap: 750, pairs: 2 },
    { label: '1v5', count: 5, peek: 900, radius: 40, gap: 700, pairs: 2 }
  ];
  var PAIR_STAGGER = 350; // ms between the two targets of a "pair" event
  var MAX_HP = 3;
  var BASE_POINTS = 100;
  var RANKS = [
    { min: 7500, name: 'CHAMPION' },
    { min: 5000, name: 'ELITE' },
    { min: 3000, name: 'PRO' },
    { min: 1500, name: 'RISING' },
    { min: 0, name: 'ROOKIE' }
  ];

  function rankFor(score) {
    for (var i = 0; i < RANKS.length; i++) {
      if (score >= RANKS[i].min) return RANKS[i].name;
    }
    return 'ROOKIE';
  }

  function speedBonus(reactionMs) {
    if (reactionMs < 300) return 100;
    if (reactionMs < 500) return 50;
    return 0;
  }

  function comboMultiplier(combo) {
    return Math.min(1 + 0.1 * Math.max(combo - 1, 0), 2.0);
  }

  function scoreForHit(reactionMs, combo) {
    return Math.round((BASE_POINTS + speedBonus(reactionMs)) * comboMultiplier(combo));
  }

  /* Build the full spawn plan for a run from a seed. Positions are fractions
     of the arena so the same plan works on any screen size. */
  function buildPlan(seed) {
    var rng = ClutchRng.makeRng(seed);
    var plan = [];
    var lastPositions = [];
    function nextPosition() {
      var p = null;
      for (var attempt = 0; attempt < 12; attempt++) {
        var cand = { x: rng.range(0.10, 0.90), y: rng.range(0.12, 0.88) };
        var ok = lastPositions.every(function (q) {
          var dx = cand.x - q.x, dy = (cand.y - q.y) * 1.4;
          return Math.sqrt(dx * dx + dy * dy) > 0.35;
        });
        if (ok || attempt === 11) { p = cand; break; }
      }
      lastPositions.push(p);
      if (lastPositions.length > 2) lastPositions.shift();
      return p;
    }
    ROUNDS.forEach(function (round, ri) {
      var events = [];
      var singles = round.count - round.pairs * 2;
      for (var i = 0; i < round.pairs; i++) events.push(2);
      for (var j = 0; j < singles; j++) events.push(1);
      // shuffle event sizes so pairs don't always come last
      for (var k = events.length - 1; k > 0; k--) {
        var m = Math.floor(rng.next() * (k + 1));
        var tmp = events[k]; events[k] = events[m]; events[m] = tmp;
      }
      var t = 600; // first spawn shortly after the round banner
      events.forEach(function (size) {
        // a "pair" spawns as two single targets PAIR_STAGGER ms apart, not
        // two at once: simultaneous pairs are nearly impossible to clear at
        // a casual pace (two 750ms reactions inside one 700-850ms window)
        var offsets = size === 2 ? [0, PAIR_STAGGER] : [0];
        offsets.forEach(function (off) {
          var pos = nextPosition();
          plan.push({
            round: ri, at: t + off,
            targets: [{ x: pos.x, y: pos.y, radius: round.radius, peek: round.peek }]
          });
        });
        t += round.gap + rng.int(0, 150);
      });
    });
    return plan;
  }

  function ClutchGame(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks || {};
    this.state = 'idle'; // idle | banner | playing | clearing | over
    this.raf = 0;
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.mouse = { x: -100, y: -100, inside: false };
    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    this._resize();
    this._resetRun();
  }

  ClutchGame.prototype._resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(320, rect.width);
    this.h = Math.max(240, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // keep live targets in place if the arena size changed mid-run
    if (this.active) {
      this.active.forEach(function (t) {
        t.px = t.fx * this.w;
        t.py = t.fy * this.h;
      }, this);
    }
  };

  ClutchGame.prototype._resetRun = function () {
    this.plan = [];
    this.planIdx = 0;
    this.active = [];      // live targets
    this.particles = [];
    this.popups = [];
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.hp = MAX_HP;
    this.round = 0;
    this.roundsWon = 0;
    this.roundClean = true; // false once the player is shot during this round
    this.shots = 0;
    this.hits = 0;
    this.reactions = [];
    this.runStartAt = 0;
    this.roundStartAt = 0;
    this.bannerUntil = 0;
    this.clearUntil = 0;
    this.shakeUntil = 0;
    this.victory = false;
    this.seed = 0;
  };

  ClutchGame.prototype.startRun = function (opts) {
    opts = opts || {};
    this._resetRun();
    // the canvas is hidden until the game screen shows; measure it now that
    // it is visible, otherwise clicks and targets use different coordinates
    this._resize();
    this.seed = opts.seed || ClutchRng.randomSeed();
    this.plan = buildPlan(this.seed);
    this.state = 'banner';
    this.runStartAt = performance.now();
    this._showRoundBanner(0);
    this._emitHud();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this._loop);
  };

  ClutchGame.prototype._showRoundBanner = function (roundIdx) {
    this.round = roundIdx;
    this.bannerUntil = performance.now() + 1100;
    if (this.hooks.onBanner) {
      var r = ROUNDS[roundIdx];
      this.hooks.onBanner('ROUND ' + (roundIdx + 1) + ' — ' + r.label,
        roundIdx === 0 ? 'Click the targets before they shoot you' : '');
    }
  };

  ClutchGame.prototype._startRound = function () {
    this.state = 'playing';
    this.roundStartAt = performance.now();
    this.roundClean = true;
    this.planIdx = this.plan.findIndex(function (ev) { return ev.round === this.round; }, this);
    if (this.planIdx < 0) this.planIdx = 0;
    if (this.hooks.onBanner) this.hooks.onBanner(null);
  };

  ClutchGame.prototype._endRound = function (cleared) {
    if (cleared && this.roundClean) {
      this.roundsWon++;
      var bonus = 250 * (this.round + 1);
      this.score += bonus;
      ClutchSfx.roundClear();
      this._popup(this.w / 2, this.h * 0.4, 'ROUND CLEAR  +' + bonus, '#34d399', 26);
    } else if (cleared) {
      // survived the round but took a hit: no bonus, round not counted as won
      this._popup(this.w / 2, this.h * 0.4, 'ROUND SURVIVED', '#fbbf24', 22);
    }
    if (this.round >= ROUNDS.length - 1) {
      this.victory = cleared && this.hp > 0;
      this._finishRun();
      return;
    }
    this.state = 'clearing';
    this.clearUntil = performance.now() + 1300;
    this._nextRound = this.round + 1;
    this._emitHud();
  };

  ClutchGame.prototype._finishRun = function () {
    this.state = 'over';
    if (this.hp > 0) this.score += this.hp * 500;
    var acc = this.shots > 0 ? (this.hits / this.shots) * 100 : 0;
    var avg = this.reactions.length
      ? Math.round(this.reactions.reduce(function (a, b) { return a + b; }, 0) / this.reactions.length)
      : 0;
    var best = this.reactions.length ? Math.min.apply(null, this.reactions) : 0;
    if (this.victory) ClutchSfx.victory(); else ClutchSfx.gameOver();
    this._emitHud();
    if (this.hooks.onGameOver) {
      this.hooks.onGameOver({
        score: this.score, roundsWon: this.roundsWon, victory: this.victory,
        hits: this.hits, shots: this.shots, accuracy: acc,
        avgReaction: avg, bestFlick: best, bestCombo: this.bestCombo,
        rank: rankFor(this.score), seed: this.seed
      });
    }
  };

  ClutchGame.prototype.quit = function () {
    cancelAnimationFrame(this.raf);
    this.state = 'idle';
    this._resetRun();
    this._render(performance.now());
  };

  ClutchGame.prototype.destroy = function () {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
  };

  ClutchGame.prototype._onPointerMove = function (ev) {
    var rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ev.clientX - rect.left;
    this.mouse.y = ev.clientY - rect.top;
    this.mouse.inside = true;
  };

  ClutchGame.prototype._onPointerDown = function (ev) {
    ev.preventDefault();
    var rect = this.canvas.getBoundingClientRect();
    this.handleShot(ev.clientX - rect.left, ev.clientY - rect.top);
  };

  /* Public: used by real input and by the attract-mode autopilot. */
  ClutchGame.prototype.handleShot = function (x, y) {
    if (this.state !== 'playing') return false;
    var now = performance.now();
    this.shots++;
    // topmost = most recently spawned first
    for (var i = this.active.length - 1; i >= 0; i--) {
      var t = this.active[i];
      var dx = x - t.px, dy = y - t.py;
      var r = t.currentRadius * 1.2; // forgiving hitbox, especially on touch
      if (dx * dx + dy * dy <= r * r) {
        var reaction = Math.round(now - t.spawnAt);
        this.reactions.push(reaction);
        this.hits++;
        this.combo++;
        if (this.combo > this.bestCombo) this.bestCombo = this.combo;
        var pts = scoreForHit(reaction, this.combo);
        this.score += pts;
        this._burst(t.px, t.py, t.color);
        this._popup(t.px, t.py - 18, '+' + pts, '#22d3ee', 20);
        if (reaction < 200) this._popup(t.px, t.py + 16, reaction + 'ms ⚡', '#fbbf24', 14);
        ClutchSfx.hit(this.combo);
        this.active.splice(i, 1);
        this._emitHud();
        return true;
      }
    }
    // miss: combo breaks, small feedback
    if (this.combo > 0) this._popup(x, y - 14, 'COMBO LOST', '#f87171', 13);
    this.combo = 0;
    ClutchSfx.miss();
    this._emitHud();
    return false;
  };

  /* For the attract-mode autopilot: the oldest live target, if any. */
  ClutchGame.prototype.getActiveTarget = function () {
    if (this.state !== 'playing' || !this.active.length) return null;
    var t = this.active[0];
    return { x: t.px, y: t.py };
  };

  ClutchGame.prototype._burst = function (x, y, color) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 160;
      this.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, color: color, size: 2 + Math.random() * 3
      });
    }
  };

  ClutchGame.prototype._popup = function (x, y, text, color, size) {
    this.popups.push({ x: x, y: y, text: text, color: color, size: size || 18, life: 1 });
  };

  ClutchGame.prototype._emitHud = function () {
    if (!this.hooks.onHud) return;
    var acc = this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : null;
    var avg = this.reactions.length
      ? Math.round(this.reactions.reduce(function (a, b) { return a + b; }, 0) / this.reactions.length)
      : null;
    this.hooks.onHud({
      score: this.score, combo: this.combo,
      mult: comboMultiplier(this.combo),
      hp: this.hp, round: this.round, roundLabel: ROUNDS[this.round].label,
      avgReaction: avg, accuracy: acc
    });
  };

  ClutchGame.prototype._loop = function (now) {
    this.raf = requestAnimationFrame(this._loop);
    // re-measure if the displayed size changed (window resize, screen shown)
    var cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (cw > 0 && (cw !== this.w || ch !== this.h)) this._resize();
    if (this.state === 'banner' && now >= this.bannerUntil) this._startRound();
    if (this.state === 'clearing' && now >= this.clearUntil) {
      this.state = 'banner';
      this._showRoundBanner(this._nextRound);
    }
    if (this.state === 'playing') {
      // spawn due events
      while (this.planIdx < this.plan.length) {
        var ev = this.plan[this.planIdx];
        if (ev.round !== this.round) break;
        if (now - this.roundStartAt < ev.at) break;
        ev.targets.forEach(function (spec) {
          this.active.push({
            fx: spec.x, fy: spec.y,
            px: spec.x * this.w, py: spec.y * this.h,
            radius: spec.radius, peek: spec.peek,
            spawnAt: now, currentRadius: spec.radius * 0.3,
            color: ['#22d3ee', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 3)]
          });
          ClutchSfx.spawn();
        }, this);
        this.planIdx++;
      }
      // expire targets → they shoot you
      for (var i = this.active.length - 1; i >= 0; i--) {
        var t = this.active[i];
        var age = now - t.spawnAt;
        if (age >= t.peek) {
          this.active.splice(i, 1);
          this.hp--;
          this.combo = 0;
          this.roundClean = false;
          this.shakeUntil = now + 220;
          if (this.hooks.onPlayerShot) this.hooks.onPlayerShot();
          ClutchSfx.shot();
          this._emitHud();
          if (this.hp <= 0) {
            this._finishRun();
            return;
          }
        }
      }
      // round clear?
      var roundDone = this.planIdx >= this.plan.length ||
        (this.planIdx < this.plan.length && this.plan[this.planIdx].round !== this.round);
      if (roundDone && this.active.length === 0) this._endRound(true);
    }
    this._render(now);
  };

  ClutchGame.prototype._render = function (now) {
    var ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);

    // shake when shot
    ctx.save();
    if (now < this.shakeUntil) {
      ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }

    // arena floor grid
    ctx.strokeStyle = 'rgba(56, 89, 145, 0.25)';
    ctx.lineWidth = 1;
    var step = 64;
    for (var gx = step; gx < w; gx += step) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (var gy = step; gy < h; gy += step) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

    // targets
    this.active.forEach(function (t) {
      var age = now - t.spawnAt;
      var grow = Math.min(age / 120, 1);
      var ease = 1 - Math.pow(1 - grow, 3);
      t.currentRadius = t.radius * (0.3 + 0.7 * ease);
      var remain = Math.max(0, 1 - age / t.peek);
      var urgent = remain < 0.3;
      var r = t.currentRadius;

      // peek countdown ring
      ctx.beginPath();
      ctx.arc(t.px, t.py, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
      ctx.strokeStyle = urgent ? '#f87171' : t.color;
      ctx.lineWidth = 4;
      ctx.stroke();

      // body
      var grad = ctx.createRadialGradient(t.px, t.py, 2, t.px, t.py, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, t.color);
      grad.addColorStop(1, '#0d1526');
      ctx.beginPath();
      ctx.arc(t.px, t.py, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = urgent ? '#f87171' : 'rgba(255,255,255,0.85)';
      ctx.stroke();

      // core
      ctx.beginPath();
      ctx.arc(t.px, t.py, Math.max(5, r * 0.22), 0, Math.PI * 2);
      ctx.fillStyle = '#070b16';
      ctx.fill();
      // rotor ticks
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      for (var k = 0; k < 4; k++) {
        var a = (k * Math.PI) / 2 + now / 600;
        ctx.beginPath();
        ctx.moveTo(t.px + Math.cos(a) * (r + 13), t.py + Math.sin(a) * (r + 13));
        ctx.lineTo(t.px + Math.cos(a) * (r + 20), t.py + Math.sin(a) * (r + 20));
        ctx.stroke();
      }
    });

    // particles
    var dt = 1 / 60;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt * 1.6;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // score popups
    ctx.textAlign = 'center';
    for (var j = this.popups.length - 1; j >= 0; j--) {
      var pp = this.popups[j];
      pp.life -= dt * 1.1;
      pp.y -= 34 * dt;
      if (pp.life <= 0) { this.popups.splice(j, 1); continue; }
      ctx.globalAlpha = Math.min(1, pp.life * 1.5);
      ctx.font = '800 ' + pp.size + 'px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;

    // crosshair at mouse
    if (this.mouse.inside && this.state === 'playing') {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.mouse.x - 20, this.mouse.y); ctx.lineTo(this.mouse.x - 8, this.mouse.y);
      ctx.moveTo(this.mouse.x + 8, this.mouse.y); ctx.lineTo(this.mouse.x + 20, this.mouse.y);
      ctx.moveTo(this.mouse.x, this.mouse.y - 20); ctx.lineTo(this.mouse.x, this.mouse.y - 8);
      ctx.moveTo(this.mouse.x, this.mouse.y + 8); ctx.lineTo(this.mouse.x, this.mouse.y + 20);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Exposed for tests.
  global.ClutchGame = ClutchGame;
  global.ClutchGameInternals = {
    ROUNDS: ROUNDS, MAX_HP: MAX_HP, BASE_POINTS: BASE_POINTS,
    PAIR_STAGGER: PAIR_STAGGER,
    rankFor: rankFor, speedBonus: speedBonus, buildPlan: buildPlan,
    comboMultiplier: comboMultiplier, scoreForHit: scoreForHit
  };
})(typeof window !== 'undefined' ? window : globalThis);
