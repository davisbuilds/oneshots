# Tideline: art bible

Written at 04:35 UTC, before any live code. It reconciles the four supplied
mockups (`studies/01-04-supplied-*`, made by the human with an image model)
into one direction. Where they disagree, this file decides. Where they are
wrong, this file corrects them.

## The product in one line

**Tideline** is the operations console of a fictional terminal, *Arden Bay
Container Terminal*. One screen: a living paper diorama of the terminal under a
calm afternoon sun, wrapped in a warm, quiet control UI. The diorama is the
game board; the UI is the instrument panel.

## Who leads what

| Reference | Leads | Taken | Left behind |
| :-- | :-- | :-- | :-- |
| 01 Nexus Port | art direction | cut-paper water in stacked layers; warm cream ground; chunky flat-shaded cranes (navy legs, mustard booms); terracotta / mustard / teal / slate container palette; cream cards with terracotta numerals; pin-capsule callouts; end-on bay section | its numbers, its schedule axis, its single-vessel stowage card |
| 02 HarborView | information architecture | left nav rail; KPI cards with a context line and a chevron; callouts with status chips; right panel with tabs (Vessel, Yard, Equipment, Gate); berth schedule with dates, per-call TEU and a now line | its saturated blue UI accents, its photoreal 3D, its bright Gantt colours |
| 03 crane close-up | motion and equipment | four hoist-rope pairs from trolley to spreader; the box lowered *into* a straddle carrier that waits on the apron; leader-line callouts that end in a dot on the equipment; yellow bollards, mooring lines, black fenders, lane paint | the label "Crane SC-17" |
| 04 vessel panel | components | profile stowage plan (bow left) with a legend; semicircular gauges with the limit band drawn and a *Within limits* state; key-particulars table | its legend colours, which do not match its own boxes |

The brief adds the second stowage view: an **end-on bay section** (as in 01)
beside the profile. The profile explains **trim** (bow-stern weight), the bay
section explains **heel** (port-starboard weight). Each gauge sits under the
view that explains it.

## Corrections to the references

| In the mockups | In Tideline |
| :-- | :-- |
| crane productivity "28.5 mph" | **moves/hr** (gross moves per crane-hour, last 60 min) |
| schedule axis 15:00 ... 22:00, NOW 20:33, then 20:00 again | one monotonic axis with date labels at midnight; NOW is a moving line |
| MSC GENEVA booked on Berth 1 and Berth 2 at once | a call occupies exactly one berth; the schedule refuses overlaps and pushes later calls |
| "Crane SC-17" | one ID scheme: **QC-nn** quay (ship-to-shore) cranes, **SC-nn** straddle carriers, **TR-nnnn** trucks, gate lanes **G1-G4**, yard blocks **A-F** |
| a 366 m ship carrying 8,492 TEU | particulars are *derived* from one hull and one bay grid in code: LOA from the bays, beam from the rows, capacity from the slots that fit inside the hull, displacement from the hull integrals; nothing is typed in |
| MSC, Maersk, IMO 9823456 | fictional lines and ships; no IMO numbers (a terminal *visit reference* instead, e.g. `ARD-2643`) |
| "Vessels at Berth 2/5, 2 in yard" | vessels at berth / berths, with *working · arriving · at anchor* context |
| gauges without limits (01) | every gauge shows its limit band; the state reads *Within limits*, *Near limit* or *Out of limits* |

## Palette

Paper colours, sampled from 01 and pulled slightly warmer. Each is used
flat; light and shade come from the renderer, not from the swatch.

| Token | Hex | Use |
| :-- | :-- | :-- |
| `paper` | `#f4ead9` | ground, quay concrete (lit) |
| `paper-2` | `#e9dcc5` | apron, roads |
| `card` | `#fbf6ee` | UI cards |
| `ink` | `#28304a` | text, crane legs, hull topsides |
| `ink-2` | `#5b6378` | secondary text |
| `navy-water` | `#21375a` | deep water |
| `teal-water` | `#3a7f8c` | mid water |
| `foam` | `#8cc4c0` | cut highlights in water |
| `terracotta` | `#c65a3e` | accent numerals, hull bottom, alerts, one container colour |
| `mustard` | `#e2a93f` | crane booms, schedule bars, one container colour |
| `teal` | `#4b8f98` | container colour, *working* state |
| `slate` | `#5d84a3` | container colour |
| `sage` | `#8fa679` | container colour, *within limits* |
| `cream-box` | `#e6d7bd` | reefers (with a navy machinery end) |
| `steel` | `#9aa3b0` | empties |

Status colours stay inside the paper family: within limits = sage
`#6f9a5e`, near limit = mustard, out of limits = terracotta. No saturated
blue anywhere.

## Light and material

- One warm sun from the upper left (azimuth about 225 deg in screen terms),
  elevation about 50 deg, so shadows fall down-right, as in 01.
- Flat shading in three tones per object: top faces lightest, sun-facing side
  mid, shaded side darkest. Shadows are soft, warm grey-brown, never black.
- Paper: a faint fibre grain over everything, and a thin lighter edge on top
  faces so stacked shapes read as cut card.
- Water is not a reflection, it is **layers of cut paper**: deep navy at the
  bottom, teal and foam layers cut in long torn strips that run parallel to
  the quay, each casting a small shadow on the layer below. The strips drift
  slowly; the cuts never cross the quay wall.

## Geometry

- Isometric orthographic camera, quay running from upper left to lower right,
  water lower left, yard upper right, gate at the far right. Pan, zoom and a
  limited rotation (two azimuths); no free 3D.
- Everything is built from boxes and a few prisms: chunky, slightly
  over-scaled equipment (crane legs at 1.3x real thickness) so it reads at
  zoomed-out scale.
- Ship hulls are meshes generated from the same hull form the stability
  model integrates. The ship sits at its computed draft, trim and heel.
- Containers: 40 ft boxes, 12.19 x 2.44 x 2.59 m (high cube 2.90 m), with
  corrugation ribs painted procedurally and a darker door end.

## Type and UI

- System sans stack (`Inter`, `SF Pro Text`, `Segoe UI`, ...); numerals tabular.
  Section headings in small caps with 0.08 em tracking (from 01); values large
  and terracotta (from 01); context lines small and grey (from 02).
- Cards: `card` fill, 12 px radius, a 1 px warm hairline and a soft
  two-layer shadow. They float over the diorama; nothing is boxed in chrome.
- Icons are drawn in code (canvas paths), 1.6 px strokes, round caps.
- Callouts (from 03): a white card with an icon, the equipment ID, one status
  chip and one line of context, joined to the equipment by a leader line that
  ends in a dot. Pins (from 01) mark equipment that is not selected.

## Layout (1920 x 1080 reference)

```
+--------------------------------------------------------------------------+
| logo  Tideline · Arden Bay        [ search ⌘K ]   ● Live  date time  user |
+----+---------------------------------------------------------+-----------+
|nav | [KPI vessels][KPI crane mph->moves/hr][KPI yard][KPI gate]| Vessel    |
|rail|                                                         | panel:    |
|    |            living isometric terminal                    | header    |
|    |      callouts anchored to cranes, SCs, trucks, blocks   | profile   |
|    |                                                         | bay sect. |
|    |                                                         | gauges    |
|    | [sim controls · demo]                                   | particulars|
|    +---------------------------------------------------------+           |
|    | Berth schedule: B1-B3, 48 h, dates, NOW, TEU, drag       |           |
+----+---------------------------------------------------------+-----------+
```

## Motion

- Simulation time runs at a chosen multiple of real time (1x to 120x); the
  default is 20x, where a crane cycle takes about six seconds on screen.
- Cranes move like machines: trapezoidal velocity profiles on trolley and
  hoist, a pause at each lock and unlock, ropes always vertical from trolley
  to spreader.
- Straddle carriers ease into and out of each grid step and rotate on the
  spot at turns; the ship settles to a new draft with a slow ease, never
  snapping.
- UI numbers tween; nothing bounces.

## Demo tour

A 45 s scripted camera move: establishing shot over the water, push in to a
crane setting a box into a waiting straddle carrier, follow the carrier into
the yard, rise to the gate queue, swing to the stowage panel as a box lands
and the heel gauge moves, end on the full console.
