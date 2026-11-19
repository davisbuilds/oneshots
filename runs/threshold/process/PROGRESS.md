# Field notes

Times are UTC, 19 November 2026.

- 12:30 · Inspected the collection, its size limits, the browser launcher and concurrent checkouts. Started a dedicated worktree. The run will play directly from a static server with all runtime resources in the run.
- 12:34 · Examined the upstream Three.js portal example. Chose a rigid half-turn between doorway frames, shared by the player and all virtual cameras. A screen-space ray/aperture intersection can still draw the part of the aperture between the eye and the near plane. The first proof will use a deliberately displaced, rotated pair.
- 12:38 · Two prototype tests failed with identity transport and an empty crossing detector. The displaced known-answer point and the swept aperture now pass, alongside inverse pose/velocity tests. The first Chrome frame shows the desert and the forest nested inside it (snapshot 01). Work continues on the three-world slice.
