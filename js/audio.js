/* Tiny WebAudio synth SFX — no audio files, no copyrighted material. */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled) return;
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  var Sfx = {
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    unlock: function () { ensureCtx(); },
    hit: function (combo) {
      // pitch rises with combo — satisfying streak feedback
      var base = 520 + Math.min(combo, 12) * 28;
      tone(base, 0.09, 'triangle', 0.18, base * 1.5);
    },
    miss: function () { tone(160, 0.12, 'sawtooth', 0.06, 110); },
    shot: function () { tone(220, 0.25, 'sawtooth', 0.14, 55); },
    spawn: function () { tone(880, 0.05, 'sine', 0.05, 1200); },
    roundClear: function () {
      tone(523, 0.12, 'triangle', 0.15);
      setTimeout(function () { tone(659, 0.12, 'triangle', 0.15); }, 90);
      setTimeout(function () { tone(784, 0.2, 'triangle', 0.16); }, 180);
    },
    gameOver: function () {
      tone(392, 0.18, 'triangle', 0.14, 330);
      setTimeout(function () { tone(311, 0.3, 'triangle', 0.14, 262); }, 160);
    },
    victory: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.22, 'triangle', 0.16); }, i * 110);
      });
    },
    click: function () { tone(700, 0.05, 'sine', 0.08); }
  };

  global.ClutchSfx = Sfx;
})(window);
