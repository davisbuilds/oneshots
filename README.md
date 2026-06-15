# oneshots

A public collection of **agent oneshot capability demos** — self-contained
artifacts each built by an AI agent in a single session, with zero
dependencies and zero build step. Every project is one HTML file you can
`open` directly in a browser.

Each project's README states the **model** used to create it.

## Projects

| Project | What it is | Model |
| :------ | :--------- | :---- |
| [seventeen](seventeen/) | **GASKET∞** — a realtime ray-marched flythrough of an infinite Apollonian gasket, built in under 17 minutes. | Fable 5 (xhigh) |
| [neon-swarm](neon-swarm/) | A Geometry-Wars-style arcade survival game with procedural audio. | Fable 5 (xhigh) |
| [lumen](lumen/) | **Lumen** — a physically based, progressive Monte Carlo path tracer. | Fable 5 (xhigh) |

## What "oneshot" means here

Each artifact is a single-session capability test: one self-contained file,
no dependencies, no build step. The goal is to see how far a model can push a
complete, runnable, verifiable artifact in one focused pass. Most include a
headless `verify.mjs` smoke test that screenshots the result and checks for
console/shader errors.

## Running any of them

```bash
open <project>/index.html
```

That's it — no install, no server.
