# Borrowed Seconds — process

Times are UTC on 2026-09-30, read from the session clock.

## 04:10 — contract and scope

Read the repository guidance and run contract. Created a local branch for the
game. The deliverable is a standalone HTML game with no downloaded art, fonts,
audio, libraries, or runtime requests. All museum artwork and sound will be
procedural. The browser verifier uses the repository's existing Playwright.

## 04:13 — rules and first verification

Chose one complete museum heist: two distant pressure stations must be held
simultaneously to open a central vault. Record a route, leave an echo at its
endpoint, rewind, and recruit yourself. Up to five echoes can repeat their
recordings. Guards investigate echoes and whistles; only the current thief
can be caught. Recordings are temporal projections of poses and actions, not
fully physical clones. Each loop resets security and the artifact.

The simulation will advance at fixed 60 Hz. A successful run should replay
with the same guards, gate states, and outcome. The same update function will
drive keyboard/touch play, the demonstration, and browser verification.

The initial browser check failed because the HTML artifact did not yet exist.
It passed after the game and its drawing/input functions were implemented.

## 04:35 — first museum and browser inspection

Implemented the interface, fixed-step simulation, A* navigation, pressure
stations, vault barrier, patrols, whistle investigations, echo recordings, and
successful-run replay. Drew the entire museum in Canvas: tiled marble,
projected walls, framed abstractions, sculpture plinths, an hourglass, guards,
coats, holographic echoes, cones, and route trails. Added synthesized audio.
Opened the first desktop and title screenshots. Snapshot 01 preserves this
version.

## 04:38 — a complete heist, and a stuck guard

Browser-directed walks reached both stations, and the demonstration extracted
the hourglass. Found that an east guard's waypoint was inside a display plinth;
it could not move. Replaced the east patrol with accessible points. The
demonstration still won, and replay matched the guard state exactly.

Echoes were also retaining a walking pose at an anchored endpoint. Their
endpoint presentation now holds still, while the underlying recorded poses
remain unchanged.

## 04:42 — optional grand larceny

Added two optional treasures, The First Moon and Entanglement. Only the live
thief can steal them, and successful replay reproduces these pickups. A real
route through both galleries, the vault, and the entry took all three home.

The first phone screenshot had movement controls below the visible screen.
Moved movement and action buttons into a fixed bottom bar, preserving scroll
space beneath the page. Snapshot 02 records the earlier layout, not the fix.
Added a map view and a follow camera.

## 04:47 — the five-person rehearsal

Expanded the guided plan to four echoes plus the live thief. Two echoes hold
stations and two whistle from recorded destinations. The first placement of
the central distraction drew a guard directly across the thief's route; the
production simulation caught the thief at tick 191. Moved that distraction
to the south-east of the central hall. The new plan extracted at tick 955
(15.92 s), without bypassing security. Snapshot 03 records the working plan.

## 04:52 — behavioral verification

Extended the browser verifier to exercise a three-treasure escape through
ordinary pointer/button handlers; exact guard/player replay; replay scrubbing;
whistle playback; walls and the sealed vault; echo endpoints and crew limits;
capture, expiry, retry, undo, and individual removal; audio output; PNG
download; touch direction capture/release; rotation; and reduced motion.

A phone test initially waited long after reaching the first station and was
legitimately caught. Changed the test to record when the walk finished, as the
player instructions specify. The fixed-step test interface also needed to
preserve held pointer keys when advancing time without injected test keys.

## 04:59 — resize recovery

The behavioral checks ran, but an intermediate canvas resize produced a
negative radial-gradient radius. Ignore zero-sized stage rectangles and clamp
the fitted scale to a positive minimum. The complete suite then passed with
zero browser errors and zero external HTTP requests.

## 05:08 — final visual pass

A small styling edit accidentally replaced the base CSS. Restored its rules
as separate selectors and reran the entire browser suite successfully. Cleared
stale pickup notices on the victory screen, improved the victory hint, removed
the browser's touch highlight, and enlarged the phone map.

Opened the finished five-person heist screenshot, phone follow view, and phone
map. Saved small WebP previews and a final checkpoint (snapshot 04). The museum
has no downloaded art or assets. Native-resolution vault detail is a crop,
without upscaling.

## 05:11 — final verification and collection integration

Added a persistent short mission prompt inside the phone stage so the current
task stays visible without scrolling to the sidebar. The complete browser
suite passed again, including the three-treasure live route, exact successful
replays, touch, rotation, audio, and the ordinary animation loop.

Recorded the exact brief, known model/harness metadata, and process lineage.
Registered the new verifier alongside the existing five and regenerated the
collection index. Preparing the final manifest and publication checks.

## 05:14 — delivery

Opened the final phone preview with its persistent mission prompt. Manifest
validation passed for all 12 runs; publication hygiene passed for 155 tracked
text files. The repository's five build-recovery regression tests passed,
and the staged diff has no whitespace errors. The new browser verifier was
run against the finished game and passed. Existing renderers and their full
asset builds were not rerun, and the other five browser verifiers were not
rerun because their behavior was unchanged.

Saved the run on the local codex/borrowed-seconds branch. No remote push,
deployment, or release publication was performed.

## 12:19 — curator attribution and PR request

The curator confirmed GPT-6.1 Sol with xhigh reasoning and authorized opening
a PR. Updated the manifest, game credit, run README, and generated collection
index. Appended the human message verbatim and counted it as the third human
turn. The exact model identifier is still unrecorded; the original 64-minute
build duration and development snapshots remain the historical record.
