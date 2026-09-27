# Artemis II — Reference Sheet

Compact engineering reference for the film *ARTEMIS II — Built for the Journey*.
All geometry in the Blender project is built in **meters at 1:1 real-world
scale** from the numbers below.

**How this sheet was made.** This environment's egress policy blocked direct
access to nasa.gov, esa.int, Wikipedia, NTRS and the Internet Archive, so no
diagrams or photographs could be downloaded. Facts were gathered through web
search result summaries of the official NASA/ESA pages and fact sheets listed in
[Sources](#sources). Each value is tagged:

- **V**: verified in a NASA/ESA/prime-contractor source returned by search.
- **D**: derived from verified values by arithmetic or fit.
- **E**: estimated from general engineering knowledge or visual familiarity with
  launch imagery; not verified in this session. Every E value is also listed
  in the disclosures in the project README.

## Configuration

Artemis II flew **SLS Block 1, crew configuration**: core stage with four RS-25
engines, two five-segment solid rocket boosters, the Launch Vehicle Stage
Adapter (LVSA), the **Interim Cryogenic Propulsion Stage (ICPS)** with one RL10
(B-2), the Orion Stage Adapter (OSA), and the Orion spacecraft *Integrity* with
its Launch Abort System. There is no Exploration Upper Stage, Universal Stage
Adapter or Block 1B hardware in this project.

| Fact | Value | Tag |
|---|---|---|
| Launch | 1 April 2026, 6:35 p.m. EDT, LC-39B, Kennedy Space Center | V |
| Crew | Wiseman, Glover, Koch (NASA); Hansen (CSA) | V |
| Orion name | *Integrity* | V |
| Sun at liftoff (LC-39B, 28.627 N 80.621 W) | elevation 13.5 deg, azimuth 268 deg (W); sunset ~7:38 p.m. | D (NOAA algorithm) |
| Vehicle height | 322 ft / 98.3 m | V |

## Major dimensions

| Element | Value | Tag |
|---|---|---|
| Core stage | 212 ft (64.6 m) tall, 27.6 ft (8.4 m) dia | V |
| Core stage structures | forward skirt, LOX tank, intertank, LH2 tank, engine section (with boattail and base heat shield) | V |
| LH2 tank | > 130 ft (39.6 m), 5 barrels + 2 domes + 2 rings | V |
| LOX tank | "over 50 ft" (~15.5 m), 2 barrels + 2 domes + 2 rings | V |
| Intertank / forward skirt / engine section heights | 6.6 m / 3.8 m / 7.8 m (engine section incl. boattail) | D (fit to 212 ft total with 0.707 elliptical domes) |
| LOX feed | two external LOX feedlines ("downcomers") down the outside of the LH2 tank into the engine section, SOFI-covered | V |
| CAPU exhaust | four ports on the boattail base heat shield | V |
| Booster-core attach | forward: booster forward skirt to intertank; aft: three struts per booster to the engine section | V |
| RS-25 | ~14 ft x 8 ft (4.3 m x 2.4 m); nozzle 121 in (3.07 m) long, 10.3 in throat, 90.7 in (2.30 m) exit | V |
| RS-25 start | begins T-6.36 s, engines 120 ms apart, order 3, 1, 4, 2 (diagonal pairs) | V |
| Booster | 177 ft (53.9 m) x 12 ft (3.7 m); five segments; nose assembly, forward skirt, aft skirt, nozzle | V |
| Booster separation motors | 4 in the forward frustum, 4 in the aft skirt | V |
| Booster segment / skirt split | 5 x 7.9 m segments; aft skirt 3.6 m; forward skirt 3.2 m; frustum 3.2 m; nose cap 3.7 m | D/E (fit to 177 ft) |
| LVSA | ~30 ft (9.1 m) tall cone, 27.6 ft to 16.8 ft (8.4 m to 5.1 m); 16 Al-Li panels; partially encloses ICPS | V |
| ICPS | 45 ft (13.7 m) x 16.7 ft (5.1 m); modified Delta Cryogenic Second Stage; one RL10 | V |
| ICPS marking | American flag | V (search summary; exact placement E) |
| OSA | 5 ft (1.5 m) tall, 18 ft (5.5 m) dia; carries a diaphragm | V |
| Orion full stack (adapter to LAS tip) | 67 ft (20.4 m) | V |
| Crew module | 11 ft (3.35 m) tall, 16.5 ft (5.03 m) dia | V |
| Crew module + service module height | 26 ft (7.9 m) | V |
| Heat shield | 16.5 ft dia; 186 Avcoat blocks | V |
| European Service Module | ~4 m tall; four solar array wings (19 m span deployed, **stowed at launch**); 33 engines (1 OMS-E, 8 auxiliary, 24 RCS in 6 pods) | V |
| Spacecraft adapter jettison (SAJ) panels | three panels around the ESM | E (panel count from Artemis I imagery) |
| Launch Abort System | 44 ft (13.4 m); ogive fairing of 4 panels; abort motor 17 ft x 3 ft with 4 reverse-flow nozzles at the top; attitude control motor 32 in dia, 8 valves; order top to bottom: ACM, jettison motor, abort motor | V |

## Artemis II-specific markings

| Marking | Location | Tag |
|---|---|---|
| NASA "worm" (red) | both boosters; letters ~7 ft high, ~25 ft long; **rotated ~45 deg forward** from the systems tunnel cover so it reads from the front | V |
| NASA worm + ESA insignia | Orion crew module adapter | V (ESA mark shown as simplified generic plate, see README) |
| Fiducial checkerboards | all five segments of each booster; Artemis II is the last flight to carry them | V |
| America 250 emblem | both boosters (Dec 2025) | V, **not reproduced**: design details unavailable |
| American flag | ICPS | V (placement E) |

## Ground systems

| Element | Value | Tag |
|---|---|---|
| Mobile Launcher 1 base | 25 ft high x 158 ft x 133 ft (7.6 x 48.2 x 40.5 m) | V |
| ML tower | 40 ft square, ~355 ft above deck; 380 ft total above ground | V |
| Vehicle support posts | 8 (4 per booster), cast steel, 5 ft (1.52 m) tall | V |
| Tail service mast umbilicals | 2, ~33 ft (10 m) tall, on the zero-level deck, to the engine section | V |
| Tower umbilicals (level above deck) | core stage intertank ~140 ft; core forward skirt ~180 ft; vehicle stabilizer ~200 ft; ICPS ~240 ft; crew access arm ~274 ft (67 ft long); Orion service module umbilical ~280 ft (tilts up at T-0) | V |
| Pad 39B hardstand | 55 ft above sea level; clean pad (no fixed service structure) | V |
| Lightning protection | three 600 ft towers with catenary wires | V |
| Flame deflector | single-sided, faces north, ~58 deg slope; exhaust leaves the trench to the north | V |
| Sound suppression | water from a ~300,000-400,000 gal tower; flow starts ~T-20 s | V |
| Hydrogen burn-off igniters | fire ~6 s before engine start across the RS-25 nozzle plane | V |
| Tower side relative to rocket | tower placed **east** of the vehicle, boosters north/south | E |

## Launch sequence used in the film

| Time | Event | Tag |
|---|---|---|
| T-20 s | sound suppression water flow begins | V |
| ~T-12 s | hydrogen burn-off igniters fire | V (6 s before engine start) |
| T-6.36 s | RS-25 start, 120 ms stagger, order 3-1-4-2 | V |
| T-0 | booster ignition, umbilical release, liftoff (no hold-down bolts on SLS) | V |
| T+0 to ~T+7 s | tower clear (computed from ~39 MN thrust / ~2.6 Gg mass) | D |
| after tower clear | roll/pitch program begins | E |

The film compresses T-20 to T-6 with an explicit time cut; T-6.36 s through
tower clearance play at close to real time across several camera angles.

## Station layout (vehicle frame)

z = 0 is the Mobile Launcher deck. All values in meters.

| Station | z | Note |
|---|---|---|
| RS-25 and booster nozzle exits | 0.77 | lowest point; vehicle 98.3 m to LAS tip |
| Booster aft skirt base (on 1.52 m posts) | 1.52 | |
| Core base heat shield | 3.97 | |
| Engine section / LH2 aft ring | 11.77 | |
| LH2 forward ring / intertank | 45.37 | booster forward skirt 45.4-48.6 overlaps intertank |
| Intertank / LOX aft ring | 51.97 | |
| LOX forward ring / forward skirt | 61.57 | |
| Core top / LVSA base | 65.37 | |
| LVSA top | 74.47 | |
| ICPS top / OSA base | 77.17 | ICPS extends 11.6 m down inside the LVSA (RL10B-2 extension stowed, E) |
| OSA top / Orion spacecraft adapter base | 78.69 | |
| ESM base | 80.59 | |
| CMA base | 84.59 | |
| Crew module base | 85.14 | hatch ~86.5 m (~284 ft; CAA level 274 ft: within layout tolerance) |
| LAS tip | 99.09 | |
| Booster centerline offset | +/-6.85 (north/south) | E |
| RS-25 positions | (+/-1.45, +/-1.45) | E |

## Component hierarchy (as built in the .blend)

```
SLS_Root
├─ CoreStage
│  ├─ CS_EngineSection ─ boattail, base heat shield, CAPU ports, TSM plates, aft attach struts
│  │  └─ RS25_E1..E4 ─ nozzle (tube wall, hatbands, steerhorn), MCC, powerhead,
│  │                   HPFTP, HPOTP, low-pressure pumps, ducts, controller, gimbal
│  ├─ CS_LH2Tank ─ aft/fwd domes, barrels, LOX feedlines x2, cable raceway, press lines
│  ├─ CS_Intertank ─ stringers, thrust-beam fittings, umbilical plate
│  ├─ CS_LOXTank ─ domes, barrels
│  └─ CS_ForwardSkirt ─ stringers, umbilical plate, antennas
├─ SRB_North / SRB_South
│  ├─ AftSkirt (+ BSM x4, post shoes), Nozzle
│  ├─ Seg_Aft, Seg_CenterAft, Seg_Center, Seg_CenterFwd, Seg_Fwd (field joints, systems tunnel, fiducials, worm)
│  ├─ FwdSkirt (+ forward attach fitting), Frustum (+ BSM x4), NoseCap
│  └─ Aft attach ring + struts
├─ UpperStack
│  ├─ LVSA
│  ├─ ICPS ─ forward skirt, LH2 tank (flag), LOX tank, truss, RL10B-2 (+ stowed extension), bottles
│  └─ OSA
└─ Orion
   ├─ Orion_SpacecraftAdapter
   ├─ Orion_ESM ─ body (MLI), 4 stowed solar wings, OMS-E, 8 aux thrusters, 6 RCS pods, radiators
   ├─ Orion_SAJ_Panel_1..3
   ├─ Orion_CMA (worm, ESA plate)
   ├─ Orion_CM ─ backshell tiles, heat shield (Avcoat blocks), windows, hatch
   └─ LAS ─ ogive fairing panels x4, adapter, abort motor + 4 nozzles, jettison motor, ACM, nose
```

## Sources

Official pages and fact sheets (reached through search summaries; direct fetch blocked):

- NASA, Artemis II Press Kit — https://www.nasa.gov/artemis-ii-press-kit/
- NASA, Space Launch System reference — https://www.nasa.gov/reference/space-launch-system/
- NASA, SLS Core Stage reference — https://www.nasa.gov/reference/sls-space-launch-system-core-stage/
- NASA, SLS Core Stage fact sheet (Jul 2024 / Jan 2026) — https://www.nasa.gov/wp-content/uploads/2024/07/sls-4961-sls-core-stage-fact-sheet-jul2024-508.pdf
- NASA, SLS Solid Rocket Booster fact sheet (Sep 2024 / Feb 2026) — https://www.nasa.gov/wp-content/uploads/2024/09/sls-4904-sls-solid-rocket-booster-fact-sheet-sep2024-508.pdf
- NASA, RS-25 fact sheet — https://www.nasa.gov/reference/space-launch-system-rs-25-core-stage-engine/
- NASA, ICPS fact sheet (Dec 2025) — https://www.nasa.gov/wp-content/uploads/2026/02/sls-5639-sls-icps-fact-sheet-dec2025-508.pdf
- NASA, LVSA fact sheet — https://www.nasa.gov/wp-content/uploads/2021/11/lvsa_fact_sheet_11172021.pdf
- NASA, OSA fact sheet — https://www.nasa.gov/wp-content/uploads/2024/09/sls-4966-sls-osa-fact-sheet-sep2024-5082.pdf
- NASA, European Service Module reference — https://www.nasa.gov/reference/european-service-module/
- ESA, European Service Module — https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Orion/European_Service_Module
- NASA, Launch Abort System reference — https://www.nasa.gov/reference/launch-abort-system/
- NASA, Orion by the Numbers (2026) — https://www.nasa.gov/wp-content/uploads/2026/01/orion-by-the-numbers-2026b.pdf
- NASA, Crew Module reference — https://www.nasa.gov/reference/crew-module/
- NASA, Mobile Launcher 1 — https://www.nasa.gov/humans-in-space/exploration-ground-systems/mobile-launcher/
- NASA, Mobile Launcher Tower Umbilicals fact sheet — https://www.nasa.gov/wp-content/uploads/2018/06/fs-2018-02-250-ksc-ml_umbilical_fact_sheet.pdf
- NASA, Launch Complex 39B — https://www.nasa.gov/reference/launch-complex-39b/
- NASA, Artemis II launch-day blog (1 Apr 2026) — https://www.nasa.gov/blogs/missions/2026/04/01/live-artemis-ii-launch-day-updates/
- NASA, Artemis II mission availability — https://www.nasa.gov/wp-content/uploads/2026/01/artemis-ii-mission-availability.pdf
- NASA, Teams add iconic NASA worm logo to Artemis II rocket, spacecraft — https://www.nasa.gov/centers-and-facilities/kennedy/teams-add-iconic-nasa-worm-logo-to-artemis-ii-rocket-spacecraft
- NASA, NASA's Moon Rocket Celebrates 250 Years of American Innovation — https://www.nasa.gov/image-article/nasas-moon-rocket-celebrates-250-years-of-american-innovation/
- NASA, Markings on SLS Provide a Different View of the Artemis I Launch — https://www.nasa.gov/missions/artemis/markings-on-sls-provide-a-different-view-of-the-artemis-i-launch/
- L3Harris, "For L3Harris, the Action Starts Six Seconds Before Artemis II Lifts Off" — https://www.l3harris.com/newsroom/editorial/2026/01/l3harris-action-starts-six-seconds-artemis-ii-lifts
- NTRS, SLS Ignition Overpressure/Sound Suppression System Performance — https://ntrs.nasa.gov/api/citations/20230016919/downloads/SLS%20Ignition%20Overpressure%20Sound.pdf
- NASASpaceFlight, SLS Core Stage MPS — https://www.nasaspaceflight.com/2019/06/sls-core-stage-mps-fuel-tank/2/
- NASASpaceFlight, Installation of new flame deflector for SLS begins on 39B — https://www.nasaspaceflight.com/2017/07/installation-flame-deflector-sls-begins-39b/
- AmericaSpace, NASA Completes Mighty Solid Rocket Boosters for Artemis 2 — https://www.americaspace.com/2025/02/25/nasa-completes-mighty-solid-rocket-boosters-for-artemis-2/
- Space.com, NASA 'worm' logo crawls onto Artemis 2 moon rockets — https://www.space.com/nasa-worm-logo-artemis-2-moon-rockets-astronauts-video
- SpacePolicyOnline, Artemis II Crew Ready to Fly Around the Moon on "Integrity" — https://spacepolicyonline.com/news/artemis-ii-crew-ready-to-fly-around-the-moon-on-integrity/
