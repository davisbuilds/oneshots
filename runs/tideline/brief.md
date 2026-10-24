# Brief

Sent at about 04:16 UTC, 2026-10-23, with four attached images. The images were
made by the human (with an image model) and are saved, converted to WebP, in
[`process/studies/`](process/studies/) as `01-supplied-*` to `04-supplied-*`.

---

On a fresh branch in my oneshots repo, build a browser-based operations console for a container port terminal that plays like a strategy game: industrial software that doesn't feel like industrial software.

The scene: a living isometric terminal. Ships at berth, ship-to-shore cranes swinging boxes, straddle carriers threading the stacking yard, trucks queuing at the gate, all framed by a crisp, product-grade control UI: berth schedule, crane productivity, yard occupancy, and a vessel stowage plan. It should look like a real product a terminal operator would want to use, and move like a game they would want to play.

Work the way a strong designer-engineer would:

1. Design before code. Four human-made mockups are attached; save them to process/studies/ as supplied references and note in the log that a human provided them.
   - The papercraft "Nexus Port" overview is the art-direction target: its palette, cut-paper water, chunky flat-shaded cranes, and calm, warm light.
   - The "HarborView" overview is the information-architecture reference: its navigation, KPI cards with context, entity callouts, vessel panel, and berth schedule with dates and TEU.
   - The vessel-panel close-up is the component reference: a profile stowage plan with a legend, trim and heel gauges that show their limits and a within-limits state, and a key-particulars table. Pair the profile with an end-on bay section, as in Nexus Port, so trim and heel each have a view that explains them.
   - The crane close-up is the motion and equipment reference: the spreader on its cables setting a box onto a straddle carrier waiting on the quay apron, and callouts anchored to the equipment they describe.
   Treat all four as direction, not specification. Their text, numbers, and names were invented by an image model and contain errors: crane productivity in "mph", a time axis that runs backwards, one vessel booked on two berths at once, a crane labelled with a straddle carrier's ID, a 366 m ship carrying only 8,492 TEU, and real carrier names and IMO-style numbers. Use fictional vessel and line names and keep vessel particulars physically consistent. Before building anything live, write a short art bible that reconciles the references.

2. Make the simulation real underneath. Loading and discharge must respect the vessel's stability: track centre of gravity, metacentric height, trim and heel as boxes move, and flag or refuse unsafe plans. Vehicles must never collide or deadlock; prove it with a checker that runs the simulation headlessly over many seeds. Use published methods and cite them. If you adapt open-source code, follow its licence and credit it.

3. Build to match the target, then hold yourself to it. At each checkpoint, screenshot the live build in a real browser beside the mockups and write down what differs. Keep iterating until the live version is at least as good as the references.

4. Make it playable. Let me assign cranes, reorder the berth schedule, and drag containers on the stowage plan, then watch the consequences ripple through the yard and the stability readout. Include a hands-off demo mode: a scripted 30 to 60 second camera tour that would work as a short video clip.

Constraints: index.html must open directly from disk, with no install, no server, and no network. No CDNs and no runtime dependencies: write your own renderer in WebGL or Canvas2D, and paint every texture and icon procedurally. Development tooling may use the repository's locked Playwright. Prioritise one remarkable screen over feature count.

I'm comfortable with hours of autonomous iteration. Build a working prototype early, then use it, inspect screenshots, and refine the simulation, interaction, and presentation. Don't stop at a plan or a mockup: build it, use it, improve it, and deliver it.

Work in `runs/<slug>/` following `RUNS.md`. Save the brief verbatim to `brief.md`. Keep `process/PROGRESS.md` as you go, with times, what you inspected, what was wrong, and what you changed. Save numbered snapshots to `process/snapshots/` at each checkpoint, WebP, about 1200 px, plus crops at native resolution, and put the supplied mockups and any rejected directions in `process/studies/`, converted to WebP within the size caps. Write full-size outputs to `output/` only, and declare them as `[[assets]]`; if a rendered demo-mode clip fits the Run assets workflow, declare it too. Fill in `run.toml` (use "unrecorded" rather than guessing), then run `python3 scripts/build_index.py` and `python3 scripts/validate_runs.py` before you finish.

## Later human messages

**About 07:41 UTC, 2026-10-23**, during the run, after the human's usage limit
paused the work from about 05:10:

> I hit my usage limit while you were working, but it has reset now. Please continue from where you left off.

**About 12:41 UTC, 2026-10-23**, during the run, after a second usage-limit
pause from about 08:30:

> I hit my usage limit while you were working, but it has reset now. Please continue from where you left off.

<!-- after delivery -->

## After delivery

**About 14:31 UTC, 2026-10-23**, after the run was delivered:

> Open up a PR and queue codex review for the work done here

**About 19:34 UTC**, after the cloud review hung:

> cloud reviews across my workspace seem to be hanging, you can spawn a sonnet 5.5 high subagent and run a local review instead. In the meantime, where can I go to play the game? I'm currently on the macbook

**About 19:42 UTC**, after playing it:

> it looks really good, the only note I have it at one point early on in the flow the last northmere wren ship was rotated a bit and looked to be overlapping the ground. other than that everything seems to function/work well

**About 19:55 UTC** (about repository settings, not the run):

> unrelated but after these fixes are in, it looks like this repo doesn't have settings configured to delete branches after merge, can you enable that and also set to squash/rebase merges. you can also clean up any local/remote branches that have already been merged into main as well

**About 00:30 UTC, 2026-10-24**, after a usage-limit pause from about 20:55,
while the last review pass was running:

> I hit my usage limit while you were working, but it has reset now. Please continue from where you left off.
