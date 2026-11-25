# Clutch Arena

**You're the last player standing. Win the clutch, round by round.**

A fast, booth-ready aim & reaction game built for the [Cloud9 x JetBrains: Sky's The Limit Hackathon 2026](https://cloud9.devpost.com/) — Category 3 (Event Mini Game).

## Play it

Open the live demo (GitHub Pages): **https://xiaohuzi955800.github.io/clutch-arena/**

Or run it locally — it's a static site with zero dependencies:

```bash
git clone https://github.com/xiaohuzi955800/clutch-arena.git
cd clutch-arena
python3 -m http.server 8000
# open http://localhost:8000/
```

No build step. No server. Works fully offline once loaded.

## How it plays

- **Solo Run** — 5 clutch rounds: 1v1 → 1v2 → 1v3 → 1v4 → 1v5. Opponents peek from cover; click them before their peek window expires or they shoot you. You have 3 HP, and a clean round restores 1 HP. A full run takes about 30 seconds.
- **Flick scoring** — faster flicks score more (tiered speed bonuses: under 300ms +150, under 500ms +75, under 800ms +25). Streaks build a multiplier up to ×2.5. Your average flick time, best flick, accuracy and best streak are all tracked; a best flick under 250ms earns a PRO-LEVEL badge.
- **Result card** — after a run, download a shareable result card (PNG) with your score, rank, best flick and the game's URL.
- **Duel Mode** — two players, one identical clutch. Player 1 plays first, then Player 2 faces the exact same target sequence (seeded RNG). Higher score wins. Both scores are automatically saved to the leaderboards.
- **Booth Display** — a second-screen live leaderboard (`?display=1`) for a booth monitor. Updates in real time via BroadcastChannel and works with no Wi-Fi at all — scores live in localStorage. While a run is in progress it shows a live NOW PLAYING bar (current score, round, HP) so the queue can follow along. Both the home screen and the booth display show a scan-to-play QR code (a static PNG — no runtime dependency) so visitors can keep playing on their own phones.
- **Haptic feedback** — on phones, hits, misses and damage trigger short vibration pulses (15ms / 25ms / 60ms), capability-gated so desktop play is unaffected and attract-mode demos stay silent.
- **Attract Mode** — after 30 seconds idle, the game plays a demo loop to draw in booth visitors. Any tap starts real play. The idle delay is configurable with `?attract=N` (seconds; `?attract=0` disables it). Idle score screens return home first so the booth always resets cleanly.
- **Local leaderboards** — Today's Top 10 and All-Time Top 10, with arcade-style 3-letter initials. A hold-to-confirm reset clears the boards between event days.

Controls: mouse click / tap only. No tutorial needed. Keyboard: Enter to start, Esc to quit. Buttons carry aria-labels, and the game respects `prefers-reduced-motion` (no screen shake or red flash). Pinch-zoom is disabled (`user-scalable=no`) so double-tap zoom can't interfere with rapid tapping.

## Why this design

Booth games live or die on three things: how fast a stranger can start playing, how quickly the line moves, and whether a crowd gathers. Clutch Arena is built for all three — one-button play, ~30-second runs, and a head-to-head mode plus a big-screen leaderboard that turns a queue into an audience. The flick/reaction mechanic is a real competitive-gaming skill, and every score, stat and leaderboard entry is stored locally so the game never depends on event Wi-Fi.

All names, artwork and characters are original. No Riot Games content is used.

## Project structure

```
index.html          — app shell, all screens
css/style.css       — dark neon arena theme
assets/
  qr-play.png       — static scan-to-play QR code (play URL, error correction Q)
js/
  rng.js            — seeded RNG (mulberry32) for fair duel runs
  game.js           — game engine: rounds, targets, scoring, rendering
  leaderboard.js    — localStorage boards + live display sync
  audio.js          — WebAudio synth sound effects (no audio files)
  display.js        — booth display view
  main.js           — screens, modes, duel flow, attract mode
tests/
  test-logic.js     — logic tests (run: node tests/test-logic.js)
  test-controller.js — controller/rank tests (run: node tests/test-controller.js)
  test-haptics.js   — haptic feedback tests (run: node tests/test-haptics.js)
```

## Tests

```bash
node tests/test-logic.js       # 90 checks: RNG determinism, spawn plans, scoring, ranks,
                               # seed handling, expiry, record validation, tie ranks
node tests/test-controller.js  # rank controller tests
node tests/test-haptics.js     # haptic feedback tests (hit/miss/damage, attract suppression)
```

Plus a 5-round headless-browser regression suite (solo, duel, booth display,
attract mode, narrow screen — 41 checks, all passing) in
`../cdp-tests/` (kept outside this repo; see the submission notes).

## Built with JetBrains tools

Junie CLI (headless) reviewed the whole codebase and implemented three rounds
of work — see [AI_SHOWCASE.md](AI_SHOWCASE.md) for the full workflow story
and [REVIEW-JUNIE.md](REVIEW-JUNIE.md) for the review itself. The review
found 26 issues; 21 were fixed across the first two rounds (9 correctness and
data-integrity fixes, 12 UX and accessibility fixes), and 5 were documented as accepted limitations with
reasons. A third round added the booth improvements: scan-to-play QR codes on
the home and display screens, capability-gated haptic feedback, and a booth
call-to-action on the score screen. Junie also generated the project's coding guidelines in
[.junie/guidelines.md](.junie/guidelines.md).

JetBrains Air (Air Gateway / Central CLI) was evaluated for the third round:
installed and verified, OAuth authorization succeeded, but login could not
complete — the JetBrains AI registration endpoint timed out from this
machine's network. The work was done with Junie CLI directly instead, and no
Air usage is claimed.

## License

MIT — see [LICENSE](LICENSE).
