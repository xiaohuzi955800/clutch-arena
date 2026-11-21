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

- **Solo Run** — 5 clutch rounds: 1v1 → 1v2 → 1v3 → 1v4 → 1v5. Opponents peek from cover; click them before their peek window expires or they shoot you. You have 3 HP. A full run takes under 2 minutes.
- **Flick scoring** — faster flicks score more (under 300ms earns a speed bonus). Streaks build a multiplier up to ×2.0. Your average flick time, best flick, accuracy and best streak are all tracked.
- **Duel Mode** — two players, one identical clutch. Player 1 plays first, then Player 2 faces the exact same target sequence (seeded RNG). Higher score wins.
- **Booth Display** — a second-screen live leaderboard (`?display=1`) for a booth monitor. Updates in real time via BroadcastChannel and works with no Wi-Fi at all — scores live in localStorage.
- **Attract Mode** — after 30 seconds idle, the game plays a demo loop to draw in booth visitors. Any tap starts real play.
- **Local leaderboards** — Today's Top 10 and All-Time Top 10, with arcade-style 3-letter initials. A hold-to-confirm reset clears the boards between event days.

Controls: mouse click / tap only. No tutorial needed. Keyboard: Enter to start, Esc to quit.

## Why this design

Booth games live or die on three things: how fast a stranger can start playing, how quickly the line moves, and whether a crowd gathers. Clutch Arena is built for all three — one-button play, sub-2-minute runs, and a head-to-head mode plus a big-screen leaderboard that turns a queue into an audience. The flick/reaction mechanic is a real competitive-gaming skill, and every score, stat and leaderboard entry is stored locally so the game never depends on event Wi-Fi.

All names, artwork and characters are original. No Riot Games content is used.

## Project structure

```
index.html          — app shell, all screens
css/style.css       — dark neon arena theme
js/
  rng.js            — seeded RNG (mulberry32) for fair duel runs
  game.js           — game engine: rounds, targets, scoring, rendering
  leaderboard.js    — localStorage boards + live display sync
  audio.js          — WebAudio synth sound effects (no audio files)
  display.js        — booth display view
  main.js           — screens, modes, duel flow, attract mode
tests/
  test-logic.js     — logic tests (run: node tests/test-logic.js)
```

## Tests

```bash
node tests/test-logic.js   # 33 checks: RNG determinism, spawn plans, scoring, ranks
```

## Built with JetBrains tools

See [AI_SHOWCASE.md](AI_SHOWCASE.md) for the full workflow story: Junie CLI (headless code review and fixes), JetBrains Air, and WebStorm (code inspection and formatting, real `.idea` project files included in this repo).

## License

MIT — see [LICENSE](LICENSE).
