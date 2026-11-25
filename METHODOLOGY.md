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
rewards fast flicks with tiered speed bonuses (under 300ms, 500ms and 800ms)
— so the score means something beyond the booth. A best flick under 250ms
earns a PRO-LEVEL badge, giving skilled players a benchmark worth bragging
about.

**Built for the booth floor.** Sessions run about 30 seconds. Controls are
mouse-click / tap only. An attract mode auto-plays a demo after 30 idle
seconds to pull in passers-by, and idle score screens return home first so
the booth always resets cleanly. A head-to-head Duel Mode gives two fans the
exact same clutch (seeded RNG) so a queue can run its own mini-tournament,
and both duel scores are saved to the leaderboards automatically. The
second-screen Booth Display shows live leaderboards on a separate monitor
via BroadcastChannel — no server, no Wi-Fi, no account — plus a live
NOW PLAYING bar while a run is in progress, so the queue can follow along.
After a run, players can download a shareable result card with their score,
rank and best flick.

**Offline-first engineering.** The game is a static site with zero
dependencies: HTML, CSS, vanilla JS and Canvas. Scores live in localStorage.
Sound is synthesized with WebAudio — no audio files, no copyrighted material.
All names, artwork and characters are original.

## Validation
- 90 automated logic tests (RNG determinism, spawn-plan fairness, scoring,
  rank thresholds, seed handling, target expiry, leaderboard record
  validation, tie ranks) plus controller rank tests — all passing.
- Browser playtests of the full loop: home → solo run → score screen →
  leaderboard save → booth display → duel mode → attract mode, plus a
  narrow-screen (390px) check. The 5-round headless-browser regression
  suite (38 checks) passes on the final build.
- Balance tuned by simulation and measurement, not guesswork: seven tuning
  variants were compared in a headless simulator (500 runs per variant per
  skill level: slow / medium / fast bot paces), then the winner was verified
  with real browser playtests. Final tuning: peek windows shrink 1700ms →
  1200ms and target radii shrink 56px → 44px across the five rounds, so
  round 1 teaches the game and round 5 demands real flick speed; a clean
  round restores 1 HP and surviving a round still earns a partial bonus, so
  casual players usually finish a run while skilled players still separate
  on the leaderboard.

## JetBrains tools in this build
Junie CLI (headless) reviewed the whole codebase and implemented two rounds
of fixes — see AI_SHOWCASE.md for the full workflow story and REVIEW-JUNIE.md
for the review itself. Junie found 26 issues; 21 were fixed (9 correctness
and data-integrity fixes, 12 UX and accessibility fixes) and 5 were documented as accepted limitations with
reasons. Junie also generated the project's coding guidelines
(.junie/guidelines.md). No other JetBrains tools were used on this build.
