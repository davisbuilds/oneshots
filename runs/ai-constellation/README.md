# The AI Constellation

**An interactive map of eight decades of AI history in a single HTML file.**
`open index.html` and 37 stars — the research, the events, the products, and the
people behind them — arrange themselves along a timeline from the 1943 artificial
neuron to the agentic era, wired together by the ideas that connect them.

**Model:** Claude Sonnet 5 (high reasoning)

Built by Claude as a capabilities demo — an information-design piece rather than
a renderer or a game (the data-viz counterpart to the graphics demos in
`../seventeen/`, `../neon-swarm/`, and `../lumen/`).

## What's inside the single file

- **A hand-authored dataset of AI history** — 37 nodes across four lanes
  (Research breakthroughs, People, Events, Products) and ~52 connections, each
  with a plain-English blurb, from McCulloch & Pitts' neuron through the Turing
  test, the perceptron and its winter, backprop, LSTMs, AlexNet, GANs,
  Transformers, GPT-3/ChatGPT, AlphaFold, and the agentic era.
- **A D3 force-directed constellation** — nodes are pinned by year on the x-axis
  and by category into horizontal lanes, then a force simulation relaxes them so
  connected ideas cluster without overlapping. Links are drawn as gentle arcs.
- **Era coloring** — every star is tinted by its year along an amber → gold →
  cyan → violet gradient, so you can read the passage of time at a glance.
- **Shape-coded categories** — circles for research, diamonds for people,
  triangles for events, squares for products.
- **Tap-to-explore detail sheet** — selecting a star dims the rest of the graph,
  highlights its direct neighbors, centers on it, and slides up a panel with its
  story and chips for each connected node that you can hop to.
- **Category filters**, a **fit-to-view** control, **pan/zoom** (0.4×–4×), a
  staggered entrance animation, an ambient twinkling starfield, and a
  `prefers-reduced-motion` path that turns the motion off.

## Controls

| Input | Action |
| :---- | :----- |
| drag  | pan the constellation |
| pinch / wheel | zoom |
| tap a star | open its story; highlight its connections |
| filter chips | isolate Research / People / Events / Products |
| connection chips | jump to a linked node |
| ✧ fit view | re-frame the whole map |

## Note on dependencies

Unlike the other oneshots in this repo, this one is single-file but not
fully self-contained: it pulls **D3 v7** from cdnjs and its typefaces from
Google Fonts at runtime, so it needs a network connection the first time you
open it. There's no `verify.mjs` here — the artifact is visual and interactive
rather than a headless renderer.
