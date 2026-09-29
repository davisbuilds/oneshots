# Progress log

Times in UTC, 2026-09-29. Snapshots referenced here are in `snapshots/`,
numbered in the order they were made.

## 1. Survey and proposal (about 19:05 to 19:10)

Read the collection (ten runs, RUNS.md, the three long-horizon briefs) and
proposed seven ideas. The gap I pointed to: nothing in the collection can be
*wrong* in a checkable way. The human picked the orrery and asked for a better
branch name: `claude/tender-pasteur-rajemm` became `claude/antikythera-engine`.

## 2. Ground truth first (19:12 to 19:25)

Before designing anything I wanted the thing the brass will be judged against.

- JPL Horizons answers through the session proxy. `src/fetch_reference.py`
  pulled DE441 heliocentric positions (mean ecliptic and equinox J2000) for the
  eight bodies Standish fits (Mercury, Venus, Earth-Moon barycentre, Mars, and
  the four giant-planet system barycentres) every 20 years from 3000 BC to AD
  3000, 300 rows each, plus the geocentric Moon every 97 days, AD 1800 to 2200.
  Committed as `data/*.csv` (197 kB) so the tests need no network.
- The approximate-positions page moved: the old `txt/p_elem_t2.txt` URL now
  returns a 404 page. The current page, `planets/approx_pos.html`, carries
  Tables 2a/2b and the error table as HTML. I transcribed Table 2a/2b into
  `src/ephemeris.py` from that page and checked the transcription the only way
  that matters, against Horizons:

  | body | max error | RMS | JPL nominal |
  | :-- | --: | --: | --: |
  | Mercury | 30″ | 10″ | 20″ |
  | Venus | 46″ | 18″ | 40″ |
  | EM barycentre | 65″ | 21″ | 40″ |
  | Mars | 149″ | 54″ | 100″ |
  | Jupiter | 777″ | 290″ | 600″ |
  | Saturn | 1309″ | 609″ | 1000″ |
  | Uranus | 1429″ | 685″ | 2000″ |
  | Neptune | 591″ | 213″ | 400″ |

  RMS is inside JPL's nominal figure for every body; the worst single sample
  (Saturn, 22′) is 1.3 times nominal, so JPL's "nominal" reads as typical,
  not maximum. The test encodes exactly that: RMS ≤ nominal, max ≤ 2 × nominal.
  A typo in any element would blow these up by orders of magnitude.

## 3. How good can integer teeth be? (19:25 to 19:45)

First probe, with no physical constraints (teeth 12 to 160, any pairing):
two compound stages already match every period to about 1e-7, three stages to
1e-9, far beyond the ephemeris. So accuracy is not the problem; building it is.

Architecture chosen: the classic reverted layout. Four parallel axes in a line:
the centre C (the nested planet tubes), two *dead* arbors N and M carrying
loose compound pipes, and the live driving arbor L, which the crank turns once
per sidereal year. Every train runs L → M → N → C. Because the axes are fixed,
each meshing pair's tooth sum is fixed by its module and the axis spacing, the
constraint real clockmakers work under. Costs, measured:

- Two meshes (L → M → C) are hopeless (tens of degrees per century).
- Three meshes with equal 48 mm spacing and ISO modules: Saturn and Neptune
  fine; Mercury, Venus and the Moon about 0.5 °/century.
- Direction: each mesh reverses rotation, so every train must have the same
  parity. A train may bounce between the dead arbors (L → M → N → M → N → C),
  giving any odd number of meshes on the same four axes.
