# Methodology — Clutch Arena

## The problem
An esports event booth has one job: turn a queue of strangers into a crowd
that stays, plays, and comes back. Most booth games fail at least one of three
things: they take too long to explain, a single session drags and stalls the
line, or they depend on venue Wi-Fi that dies under load. The Cloud9 booth
also needs a game that feels like esports — not a generic arcade clone.

## The approach
We studied the previous edition's winning mini-game (Junie's Arcade: three
skill games + a global online leaderboard) and the Category 3 brief, then
designed around the brief's explicit call-outs: sessions under 3 minutes,
zero-tutorial controls, clean resets between players, a real gamer skill, and
a local leaderboard that works with no Wi-Fi.

**One coherent game, not a bundle.** Instead of several unrelated mini-games,
Clutch Arena is a single narrative loop: you are the last player standing in a
championship match and must win clutch rounds 1v1 through 1v5. Every mechanic
serves that fantasy — peek windows create urgency, flick speed is scored,
streaks build a multiplier, and the run ends with a rank and full stats.

**A real skill, measured honestly.** Flick shots and reaction time are
genuinely useful to competitive FPS players. The game measures reaction time
in milliseconds from target appearance to hit, shows live averages, and
rewards sub-300ms flicks — so the score means something beyond the booth.

**Built for the booth floor.** Sessions run about 20–30 seconds. Controls are
mouse-click / tap only. An attract mode auto-plays a demo after 30 idle
seconds to pull in passers-by. A head-to-head Duel Mode gives two fans the
exact same clutch (seeded RNG) so a queue can run its own mini-tournament.
The second-screen Booth Display shows live leaderboards on a separate monitor
via BroadcastChannel — no server, no Wi-Fi, no account.

**Offline-first engineering.** The game is a static site with zero
dependencies: HTML, CSS, vanilla JS and Canvas. Scores live in localStorage.
Sound is synthesized with WebAudio — no audio files, no copyrighted material.
All names, artwork and characters are original.

## Validation
- 33 automated logic tests (RNG determinism, spawn-plan fairness, scoring,
  rank thresholds) — all passing.
- Browser playtests of the full loop: home → solo run → score screen →
  leaderboard save → booth display → duel mode.
- Balance tuned by playtesting: peek windows shrink 1400ms → 900ms and
  target radii shrink 52px → 40px across the five rounds, so round 1 teaches
  the game and round 5 demands real flick speed.

## JetBrains tools in this build
See AI_SHOWCASE.md. In short: Junie CLI ran headless code reviews and fixes,
JetBrains Air orchestrated agent sessions, and WebStorm provided code
inspection and formatting; the real `.idea` project files are committed in
this repository as evidence.
