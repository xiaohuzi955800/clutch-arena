# Clutch Arena review

## Scope and verification

The original review covered `index.html`, `css/style.css`, all `js/*.js`, the logic tests, and sections 1 and 3 of `../POLISH-AUDIT.md`. The original checks below are historical; round-B changes and verification are recorded separately.

- `node tests/test-logic.js`: 37 passed, 0 failed. `node --check` passed for all game scripts and the test script.
- In-memory Node harnesses exercising the actual controller, game and display code reproduced the Enter-key, score-idle, canceled-reset, zero-seed, late-hit and unescaped-field cases below. DOM, canvas, timers and browser APIs were stubbed; HTML execution was not tested.
- No browser executable was found on PATH for independent visual, assistive-technology, autoplay-policy or full two-tab playtesting. The prior audit's browser results are not independent verification by this review.

### Fix verification

- `node tests/test-logic.js`: 58 passed, 0 failed; `node --check` passed for every `js/*.js` file.
- Headless Chromium: scaled canvas input, resize behavior, partial save feedback and retry, canceled/lost pointer capture, and duplicate hold prevention passed. Additional browser checks covered cross-tab board updates, duel save failures, and a native mouse hold.
- Live-message validation, reset deletion failures, cross-tab write races and the other explicitly excluded findings remain outside the scope of these fixes. Full assistive-technology, autoplay-policy and background-tab duel testing was not performed.

### Round-B verification

- `node tests/test-logic.js`: 90 passed, 0 failed. `node tests/test-controller.js` passed, including tied prospective and saved ranks and the cutoff. `node --check` passed for every `js/*.js` file.
- Headless Chromium checks exercised idle activity and active-run protection, keyboard controls and reset, 320px reflow at 200% desktop zoom, short-screen scrolling, focus and forced colors, reduced-motion CSS and canvas effects, screen announcements, sound state, midnight rollover and cross-tab score updates. These used emulated input, not a physical touch device or screen reader.
- The opaque attract hint is 10.88:1 against its background; input borders are 7.67:1 and 6.62:1 against their respective backgrounds.
- A pointer hold clears the boards, but releasing it immediately restores the default reset label rather than retaining the cleared message. Pointer-hold behavior was intentionally left unchanged in this round.

## Verification of the five polish fixes (original review)

1. **Attract hint:** Correct in source. `index.html:145–147` places it directly under `#app`, and `css/style.css:66–69` displays it for `body.attract`; it is no longer hidden with the home screen. See findings 23 and 25 for remaining accessibility concerns.
2. **Attract restart:** The original score/result-screen dead end is fixed: `js/main.js:242–269` returns to home and starts a demo; `js/main.js:337–339,376–378` disarms the timer before a new run, and `js/main.js:253–255` avoids interrupting an active game. The idle handling is incomplete (findings 6–7).
3. **Name XSS:** The reported name sinks are fixed: `js/main.js:7–11,36–38,219–226` escapes home-board and duel-card names; the winner and duel indicator use `textContent` (`js/main.js:115–116,216–218`). Display names and live labels are also escaped (`js/display.js:32–33,72–82`). This does **not** make every HTML interpolation safe: see finding 1.
4. **Audio unlock:** The three named paths now call `unlock()` directly in their click handlers (`js/main.js:337–338,376–377,393–395`). The separate home Enter shortcut still does not (finding 15); actual autoplay behavior was not browser-tested.
5. **Broken links:** `README.md:64–68` and `METHODOLOGY.md:64–69` now mention the absent `AI_SHOWCASE.md` as future documentation, not as a Markdown link. The reported broken links are removed.

Other `innerHTML` uses render constants or in-process game-derived values, including the round banner (`js/main.js:95–99`, `js/game.js:184–190`) and score statistics (`js/main.js:167–180`); no additional user-controlled string path to those sinks was identified.

## Findings

The original descriptions and line references below are historical. FIXED annotations identify the current implementation and the scope addressed by this task.

### Security and data integrity

1. **FIXED (stored-record scope):** `js/leaderboard.js:37–55` validates and repairs records. Live-update message validation and DOM construction were outside this task and remain unaddressed. **Major — Unescaped non-name fields still reach HTML.** `js/leaderboard.js:37–43`, `js/main.js:36–38`, `js/display.js:27–34,72–75`. A stored string in `score` or `rounds` is interpolated as HTML; a `live-update` message's `round` is also interpolated directly. For example, a stored `rounds: "<img src=x onerror=alert(1)>"` reaches the display HTML unchanged. This requires a malicious/compromised same-origin context, or already-tampered local storage; ordinary names alone do not reach these sinks unescaped, and BroadcastChannel is origin-scoped. Validate finite numeric fields on load and on message receipt, reject malformed records, and construct DOM nodes with `textContent` rather than interpolating data into HTML.

2. **FIXED (stored-record scope):** `js/leaderboard.js:37–59` filters invalid records before rendering and re-saves the cleaned list. **Major — One malformed stored entry can break the UI.** `js/leaderboard.js:37–43,50–52`, `js/main.js:29–39`, `js/display.js:52–60,97–104`. Valid JSON such as `[{"name":"A","score":null,"rounds":1}]` passes `load()` but `score.toLocaleString()` throws. Display startup fails before listeners are registered, so a later correction from another tab does not automatically repair that view. Validate every record and discard or repair invalid ones before sorting/rendering; subscribe and recover gracefully even if initial rendering fails.

3. **FIXED (score-save scope):** `js/leaderboard.js:62–71,91–109`, `js/main.js:204–223,540–565` report failed board writes and allow solo retries. Reset deletion failures and cross-tab atomicity remain outside this task. **Major — Failed persistence is silently reported as success.** `js/leaderboard.js:46–48,67–78,81–87`, `js/main.js:501–511`. Blocked storage, quota exhaustion or a partial write can lose a score or leave daily/all-time boards inconsistent while the initials box disappears; reset can also appear successful when deletion fails. Return explicit success/failure, surface it to the player, and make related board updates atomic where possible.

4. **Major — Concurrent score saves can overwrite each other.** `js/leaderboard.js:67–76,81–87`. Two tabs can read the same old board and write competing read-modify-write results; a reset can race a save too. Broadcast notifications do not serialize writes. Use a cross-tab lock with a suitable fallback, or transactional storage such as IndexedDB, and coordinate reset with saves.

5. **FIXED:** `js/main.js:418–451` guards the active hold and cancels it on pointer cancellation or lost capture. **Major — Canceling a reset hold can still erase the boards.** `js/main.js:397–412`. The reset timer is canceled on `pointerup` and `pointerleave`, but not `pointercancel`; for example, an interrupted touch can trigger deletion two seconds after cancellation. Handle `pointercancel` and lost pointer capture, manage a single active hold, and only clear after a continuously valid confirmed hold.

### Game flow and scoring

6. **FIXED:** `js/main.js:265–278,515–541` rearms on keyboard, input and pointer activity on home, score and duel-result screens, and never interrupts an active run. **Major — The score timeout is not actually idle-aware.** `js/main.js:162–197,242–265,426–430`. Only pointer activity on the home screen rearms the timer; typing initials or interacting on the score screen does not. After 30 seconds from screen entry the demo can replace an actively used screen, losing unsaved initials or abandoning the P1-to-P2 handoff. Reset the idle deadline on relevant keyboard and pointer activity on score/result screens, and preserve or explicitly warn about unsaved/handoff state.

7. **FIXED:** `js/main.js:279–284,355–359,529–541` arms and rearms the setup timeout and returns home on expiry. **Minor — Duel setup can remain abandoned indefinitely.** `js/main.js:316–319,360–373`. Opening duel setup disarms attract mode, and no new timeout is armed until the user returns home or starts a run. A visitor who walks away leaves the booth on setup. Arm an activity-aware setup timeout that returns to home without interrupting active editing.

8. **FIXED:** `js/leaderboard.js:81–130`, `js/main.js:151–174,618–637` use stable ties, prospective qualification and the saved entry's actual rank. **Minor — Today's rank mishandles ties.** `js/main.js:142–159`, `js/leaderboard.js:50–57,75`. The displayed rank counts only strictly higher scores, but stable score sorting puts a new tied entry after existing equal entries; a full board also refuses a score equal to its last entry. Thus a tied score can be advertised as #1 or Top 10 when its actual stored position is lower or it cannot qualify. Define tie policy consistently across qualification, sorting and rank display; after saving, identify the actual saved entry.

9. **FIXED:** `js/game.js:288–292,363–382,414` share expiry and game-over handling between shots and frames. **Major — Expired targets can still score between frames.** `js/game.js:283–298,385–400`. `handleShot()` does not check `peek`; expiration happens only on the next animation frame. A click at age 1201 ms on a 1200 ms target can score rather than incur damage. Resolve overdue expirations, including game-over, before accepting a shot, using a single consistent clock.

10. **FIXED (scheduled-spawn scope):** `js/game.js:396–414` uses each planned spawn time and expires overdue targets. **Major — Frame stalls change duel timing and target overlap.** `js/game.js:367–380`. When a delayed frame crosses multiple scheduled spawns, they all receive the same `spawnAt: now`, even when planned 500 ms apart. The same seed can consequently present different overlaps and timing to the two players. Define a consistent pause/catch-up policy and advance events against the planned game clock; test stalls and background-tab transitions for both duel players.

11. **FIXED:** `js/game.js:176` preserves seed zero. **Minor — Seed zero is replaced, breaking the identical duel.** `js/game.js:168–175`. `opts.seed || randomSeed()` treats valid seed `0` as absent; if the duel's random seed is zero, the two runs can receive different replacement seeds. Check for `null`/`undefined` explicitly and test seed zero through `startRun`, not only `buildPlan`.

12. **FIXED:** `js/game.js:299–304,312` scores raw elapsed time and rounds statistics and display. **Minor — Reaction-time thresholds round before scoring.** `js/game.js:293–298`. For example, 299.6 ms rounds to 300 and earns the lower speed tier, despite being under 300 ms. Compare the raw elapsed time to the advertised thresholds and round only display/statistics values.

13. **FIXED:** `js/game.js:126–132,271–284,384–389` scale pointer coordinates and track the displayed dimensions. **Major — Small canvases misalign visible targets and shots.** `js/game.js:126–133,269–279`, `css/style.css:84–86`. The logical arena is forced to at least 320×240, but pointer coordinates remain in CSS pixels. If the displayed arena is smaller, e.g. a short window or zoomed/narrow viewport, drawing is scaled while input is not; some targets become difficult or impossible to hit. Map coordinates using the actual displayed-to-logical size ratio, or size the logical arena to the displayed canvas, and test both dimensions below the minimum.

14. **FIXED:** `js/main.js:515–525` excludes interactive home targets from the document shortcut. **Major — Enter on a focused home control starts solo instead.** `js/main.js:415–423`, `index.html:21–24`. The document-level Enter handler starts a solo run regardless of the focused control, so pressing Enter on Duel or Booth Display begins a game before the button's native activation. Restrict the shortcut to a non-interactive home target or remove it in favor of native button activation; ensure it does not conflict with focused controls.

15. **FIXED:** `js/main.js:521–524` unlocks audio in the home Enter gesture. **Minor — The home Enter shortcut omits audio unlock.** `js/main.js:415–423`, `js/audio.js:8–15,38`. Unlike the click start paths, this keyboard path does not call `unlock()` during the gesture; a context created/resumed later by a game sound may be blocked under autoplay policy. Route all start paths through one gesture-time unlock/start function, and test with real browser autoplay restrictions.

### Display and live updates

16. **FIXED:** `js/display.js:53–70,92–101,109–121` checks the local date on clock ticks, visibility and page restoration. **Minor — Today's board can stay stale past midnight.** `js/display.js:52–64,85–106`. The display clock ticks, but the board refreshes only on start or a board update. If no one saves after midnight, yesterday's champion remains labeled TODAY. Detect date changes on clock ticks and visibility/resume, then refresh.

17. **Minor — Live state has no fallback when BroadcastChannel is unavailable.** `js/leaderboard.js:12–13,94–103`. Storage events can refresh scores, but live updates/end are dropped silently. Provide a timestamped transient storage-event fallback with expiry, or visibly indicate live updates are unavailable.

18. **Minor — Concurrent runs interfere with the live bar.** `js/leaderboard.js:20–26,96–103`, `js/display.js:46–49`. Messages have no run/source identity; updates from two game tabs overwrite each other and either run's `live-end` hides the other's bar until the next heartbeat. Include a run ID and track/select active runs, or explicitly enforce one active game tab.

### Accessibility

19. **Major — Gameplay has no keyboard or nonvisual equivalent.** `index.html:57–58`, `js/game.js:120–121,276–291`. The canvas exposes no accessible targets and firing requires pointer coordinates, so keyboard-only and screen-reader users cannot play. Provide keyboard-operable target selection/activation and accessible target and status announcements, or a genuinely playable alternative mode; adding `tabindex` alone is not enough.

20. **FIXED (short-screen scope):** `css/style.css:25–30,178–184` allows screens to grow and scroll, and `js/main.js:24–27` resets page scroll on navigation; `index.html:5` retains the documented tap-zoom restriction. **Major — Zoom and short screens can make controls inaccessible.** `index.html:5`, `css/style.css:16–27,46–48,99–100,122–123,141–153`. The viewport disables zoom where honored, while fixed-height screens and hidden body overflow can clip content at enlarged text, zoom or short viewport heights. Remove zoom limits, allow content to grow and scroll, and verify 320 CSS-pixel reflow and 200% zoom.

21. **FIXED:** `css/style.css:47,173–175` provides visible input and button outlines, including forced colors. **Major — Input focus is invisible.** `css/style.css:117–118,129–130`. Both initials and duel-name inputs remove the browser outline without a replacement. Add a clearly visible `:focus-visible` indicator, including in forced-colors mode.

22. **FIXED:** `js/main.js:442–512` adds a three-second keyboard confirmation and preserves the pointer hold. **Major — Board reset is not keyboard-operable.** `index.html:140`, `js/main.js:397–412`. A native button's keyboard-generated click does not trigger the pointer-only hold handlers. Offer an accessible keyboard-operable confirmation flow, while preserving protection from accidental deletion.

23. **FIXED (requested motion scope):** `css/style.css:167–171`, `js/game.js:112–119,281–283,349–363,445–447,493–500` disable nonessential CSS motion, particles, popups, shake and rotor motion. Target growth and the countdown still convey gameplay timing, with the hitbox unchanged. **Minor — Reduced motion is only partly respected.** `css/style.css:33–35,66–68,150–151`, `js/game.js:112–114,416–419,429–434,464–495`. The audit's shake and red-flash restrictions are present, but pulsing, transitions, target growth/rotation, particles and moving popups remain. Honor `prefers-reduced-motion` for nonessential CSS and canvas motion and provide a way to stop indefinite animation.

24. **FIXED (requested announcement scope):** `index.html:13,65`, `js/main.js:24–35,370–376` announce screen changes and synchronize sound's pressed state. **Minor — Screen changes and sound state lack accessible communication.** `js/main.js:23–26,330–334`, `index.html:41–59,64,69–75,105–109,118–125`. Navigation only changes CSS classes, without moving focus or announcing the new screen/result; the sound button's fixed `aria-label` hides the visible ON/OFF state and has no `aria-pressed`. Focus an appropriate new-screen heading, announce important changes via scoped status regions, and synchronize an accessible toggle state.

25. **FIXED:** `css/style.css:70–73,121–122,133–134` keeps the hint opaque and uses higher-contrast input borders. **Minor — Essential hint and input boundaries have low contrast.** `css/style.css:3–5,13,66–68,117–118,129–130`. At 35% pulse opacity the 15px attract hint has roughly 2.2:1 contrast on the dark base; input borders also have insufficient contrast against their surroundings. Keep essential text opaque with at least 4.5:1 contrast and give input boundaries at least 3:1 contrast against adjacent colors.

26. **Minor — Fixed reaction deadlines exclude slower players.** `js/game.js:12–17,385–399`. Targets expire in 1.2–1.7 seconds with no timing accommodation. Add a slower or untimed accessibility/practice mode, keeping its scores separate from competitive leaderboards if necessary.

## Accepted limitations

- **4 and 18:** The booth assumes one game tab and one display tab; the display tab never writes scores or runs games. Concurrent game tabs remain unsupported.
- **17:** BroadcastChannel is supported in modern browsers. Score updates already fall back to storage events; only the live bar lacks a fallback.
- **19:** A reaction aim game has no meaningful keyboard-only equivalent; pointer play is the genre standard, as in the prior edition's winners.
- **26:** A separate untimed practice mode is deferred. The existing V-G balance already lets casual players win: slow-tier victory was 10/10 in prior validation.

## Verdict

**Round-B scope addressed, with limitations.** Short-screen scrolling, focus, keyboard reset, announcements and reduced motion improve booth usability, but pointer-only gameplay, the documented zoom restriction, and the other accepted limitations remain. Live-message validation and reset deletion failures also remain outside the fixes; broader assistive-technology, autoplay-policy and background-tab testing is still advisable before release.