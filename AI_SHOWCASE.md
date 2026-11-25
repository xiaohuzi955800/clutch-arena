# AI Workflow Showcase — Clutch Arena

How Junie (JetBrains) was used on this build, honestly told: what the agent
did, what the human checked, and what went wrong along the way. This is the
entry's Best AI Workflow Story material. Junie CLI is the only JetBrains
tool used on this build; JetBrains Air was evaluated for the third round
and could not be used (see Step 4).

## Setup

- **Tool:** Junie CLI v4171.6 (Junie 26.11.3), headless mode, on a Linux VM.
  Authenticated with a token from the JetBrains account (All Products Pack +
  JetBrains AI Ultimate licenses, activated with the credits from Devpost).
- **One environment hurdle:** the VM's egress proxy intercepts TLS, and
  Junie's bundled JBR did not trust the proxy's CA, so the model service was
  unreachable (`SSLHandshakeException: PKIX path building failed`) even
  though `curl` worked fine. Fixed by importing the proxy CA into the JBR
  `cacerts` keystore. Worth knowing for anyone running Junie behind a
  corporate proxy: the fix has to be reapplied after a Junie version upgrade,
  because the upgrade ships a new runtime directory.
- **Working style:** every Junie task ran non-interactively with an explicit
  scope (which findings to fix, which to leave alone, and what not to touch —
  the tuned game-balance parameters were off-limits in every task).

## Step 1 — Full code review (Nov 25, ~4 minutes)

Junie read the entire codebase (HTML, CSS, 6 JS modules, tests) and produced
[REVIEW-JUNIE.md](REVIEW-JUNIE.md): **26 findings**, each with file/line
references, a reproduction, and a severity. It also verified the five fixes
from the earlier human polish round as correct, and generated the project's
coding guidelines ([.junie/guidelines.md](.junie/guidelines.md): vanilla JS,
ES5 style, zero dependencies, seed-deterministic duels, never trust stored
data).

The verdict was blunt — **not ready to ship** — and it was right. The
findings a human review had missed included:

- **Expired targets could still score.** Expiry only happened on the next
  animation frame, so a click at 1201ms on a 1200ms target scored instead of
  costing HP.
- **Frame stalls broke duel fairness.** When a delayed frame crossed several
  scheduled spawns, all targets got `spawnAt: now` even though they were
  planned up to 500ms apart — the same seed could play differently for the
  two duel players.
- **Seed 0 was silently replaced.** `opts.seed || randomSeed()` treated a
  valid seed of 0 as absent, so a duel seeded 0 could give the two players
  different target sequences.
- **Reaction tiers rounded before scoring**, so 299.6ms scored as the 300ms
  tier.
- **Small screens misaligned input and rendering**: the logical arena is
  floored at 320×240, but pointer coordinates were raw CSS pixels, so on a
  smaller displayed arena some targets were unhittable.
- **Stored leaderboard records were used without validation** — one tampered
  `localStorage` entry (`score: null`) crashed rendering, and non-numeric
  fields reached `innerHTML`.

Before acting on any of it, the human (the project's Muse agent) read the
source and confirmed each key finding independently. The review was treated
as a claim to verify, not a verdict to obey.

## Step 2 — Round A: correctness and data integrity (9 findings)

Junie implemented the nine correctness and data-integrity fixes, with
regression tests for each Node-testable change. Highlights:

- A shared `_expireTargets(now)` routine used by both the game loop and the
  shot handler, so a shot at age ≥ peek can never score.
- Spawn times taken from the planned schedule (`roundStartAt + ev.at`),
  restoring identical timing for both duel players.
- Explicit `null`/`undefined` checks for the seed; raw reaction times for
  scoring, rounding only for display.
- Pointer coordinates scaled by the logical-to-displayed ratio, and a resize
  check that no longer re-measures every frame on small screens.
- Leaderboard records validated on load (invalid entries dropped, list
  re-saved clean); `save()` returns success/failure and the UI shows a retry
  message instead of silently reporting success; the hold-to-reset gesture
  now also cancels on `pointercancel` and lost pointer capture.

Result: logic tests grew from 37 to **58, all passing**; every JS file
passed `node --check`. The human then re-read each changed region and
re-ran the suite independently before accepting the round.

## Step 3 — Round B: UX and accessibility (12 findings)

The second round covered the idle timer (typing initials no longer gets
interrupted by the attract demo), a timeout for an abandoned duel-setup
screen, a consistent tie policy for today's rank, an Enter shortcut that no
longer hijacks focused buttons and now unlocks audio, midnight rollover on
the booth display, short-screen scrolling, visible `:focus-visible` styles,
a keyboard-operable reset (double-Enter confirm), `prefers-reduced-motion`
support in CSS and on the canvas, an `aria-live` screen announcer with a
synced `aria-pressed` sound toggle, and contrast fixes.

**Mid-round, the VM restarted** and killed the Junie session with about half
the fixes applied and none of them documented. The recovery run was given a
different instruction than the original: *audit the current code first,
then implement only what is missing.* Junie correctly identified 9 findings
as already done, completed the remaining 3, added the "Accepted limitations"
section (5 findings deliberately not fixed, each with its reason — e.g. a
reaction aim game has no meaningful keyboard-only equivalent, and the booth
assumes a single game tab), and updated the review's verdict.

Result: logic tests grew to **90, all passing**, plus a new controller test
file for the rank logic. The human verified the round the same way: re-read
the diffs, re-ran the tests, and spot-checked the trickiest fixes
(idle-rearm listeners, the Enter restriction, the tie-rank lookup).

## Step 4 — Round C: booth improvements, and the Air attempt

After submission, an external review (a Grok-generated plan) was compared
against the build. The core design already matched; three gaps were worth
closing: a scan-to-play QR code on the home and booth-display screens, phone
haptic feedback, and a booth call-to-action on the score screen.

**JetBrains Air was evaluated first** for this round, because the workflow
story would be stronger with a second JetBrains tool genuinely used. Air
Gateway (Central CLI v2.8.1) installed and verified cleanly on the VM, and
the browser OAuth authorization succeeded twice — but login could not
complete: the JetBrains AI registration endpoint
(`auth.grazie.ai/auth/jetbrains-jwt/register`) never answered from this
machine's network (30s timeout in the CLI; an independent `curl` test showed
the host reachable but the endpoint hanging for 40s+). The EAP terms were
read and accepted along the way, but no Air-run work was ever produced, so
**no Air usage is claimed anywhere in this submission**. The work went ahead
with Junie CLI directly, the same way as the first two rounds.

Round C (Junie, ~3.5 minutes):

- **QR codes:** a static PNG (generated offline with segno, error
  correction Q, decode-verified to the play URL) added to the home screen
  (140px, with a "no app, no install" caption) and the booth display
  (200px). No runtime dependency — the image is just an `<img>` tag.
- **Haptics:** a guarded `_vibrate()` in the game engine (hit 15ms, miss
  25ms, damage 60ms), capability-checked so desktop and Node environments
  are unaffected, and suppressed in attract mode. A new
  `tests/test-haptics.js` covers the three pulses and the suppression.
- **Booth CTA:** "Liked it? Play again at the Cloud9 booth." on the solo
  score screen, hidden on the duel Player-1 score screen (where the button
  already says whose turn is next).

The human verified the round the same way as before: read each diff, confirmed
the V-G balance constants were untouched, re-ran all tests independently, and
added four checks to the browser regression suite (QR images loading on both
screens, CTA visible on the solo score screen, CTA hidden for duel Player 1).

## Final validation — beyond Junie's own checks

Junie's checks are not the last word. The final build was validated
independently:

- **90 logic tests + controller tests + haptic tests**, all passing (run by the human, not
  just by Junie).
- **A 5-round headless-browser regression suite** (solo, duel, booth
  display, attract mode, narrow screen — 41 checks, all passing), re-run
  after both fix rounds and after the booth-improvement round. Getting it running took its own debugging: Chrome
  157's Local Network Access checks block `localhost` navigations from
  `about:blank` in this environment, so the suite now runs over `file://`
  with `--allow-file-access-from-files` (cross-tab `BroadcastChannel` and
  `localStorage` verified working there).
- **Balance untouched by the fix rounds**: the tuned V-G parameters were
  never modified, and the browser suite confirms the fast bot still clears
  all 5 rounds at CHAMPION rank while the slow tier still wins — the fixes
  changed correctness, not difficulty.

## What worked, what didn't

- **Worked:** Junie as a *reviewer* — it found real, reproducible bugs with
  exact line references, including three fairness bugs in duel mode that
  matter for a competition entry. Junie as a *fixer* within a tight scope,
  with tests as the acceptance criterion. The recovery run's audit-first
  approach after the restart.
- **Didn't work:** Junie could not do real browser or assistive-technology
  testing in this environment (it ran Chromium checks where it could, but
  physical touch and screen-reader testing remain unperformed — stated
  openly in the review). The restart also showed that Junie's session state
  lives outside the project directory, so the durable evidence is the
  review document, the guidelines file, and the code changes themselves —
  not the session log. And JetBrains Air Gateway could not be logged into
  from this machine at all — the registration endpoint timed out — so the
  third round stayed on Junie CLI and the submission claims only what was
  actually used.

## Evidence in this repository

- `REVIEW-JUNIE.md` — the full review: 26 findings, fix markings with
  file/line references, accepted limitations, final verdict.
- `.junie/guidelines.md` — project guidelines generated by Junie.
- `tests/test-logic.js`, `tests/test-controller.js`, `tests/test-haptics.js`
  — 90 logic checks plus controller and haptic tests, including regressions
  for the fixed bugs.
- `assets/qr-play.png` — the static scan-to-play QR code.
- This file.
