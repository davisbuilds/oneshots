# Experimental notebook

Run these commands from the Cambrian Engine directory with Node 24. The headless runner and browser load the same `engine.js`. Each receipt records the engine's source SHA-256.

```sh
mkdir -p output
node --test tests/*.test.cjs
node lab.cjs --seed 17 --ticks 1200 --environment jade --mutation off --sample-every 120
node lab.cjs --replay saved-world.json > output/replayed-world.json
node lab.cjs --replay saved-world.json --control > output/replayed-control.json
node experiments/run.cjs ecology > output/ecology.json
node experiments/run.cjs mosaic > output/mosaic.json
node experiments/run.cjs stability 73 620000 > output/stability.json
node experiments/run.cjs benchmark > output/benchmark.json
node --cpu-prof --cpu-prof-dir=output --cpu-prof-name=cambrian.cpuprofile experiments/run.cjs benchmark > output/profiled-benchmark.json
node experiments/run.cjs profile-summary output/cambrian.cpuprofile output/profiled-benchmark.json > output/profile.json
```

The replay envelope has `schema: 1`, the `engineSha256` digest, `seed`, `ticks`, `environment`, `mutation`, and ordered `actions`. The lab rejects a recorded digest that differs from the loaded engine. An action such as `{"tick":120,"action":"jade"}` changes renewal targets after 120 ticks have completed. Resource stock responds through subsequent renewal. Actions at the same tick run in file order. Lab JSON adds `sampleEvery` and `samples`. The replay runner recomputes those samples, and `--sample-every N` changes the interval. `--control` replays `control.record` from a paired browser export, using that arm’s settings, actions, and sample interval. `--sample-every N` can also resample the control. `--actions FILE` accepts the action array by itself for a new seed or environment. The engine uses fixed arithmetic for its trigonometric and diversity calculations. The browser verifier reproduces the final measurements of both arms of a paired export in Node. Archive the engine revision with long-horizon comparisons.

## Inherited resource adaptation

Seeds 17, 31, 73, 101, 211, and 307 each started four donor worlds with the same 96 founding organisms. Jade and amber renewal were crossed with standard mutation and zero mutation. The donors ran for 4,800 ticks. All 24 survived. Across the 12 mutation-enabled worlds, 254–309 individuals remained across 137–173 living branches, with 254–309 distinct genomes. The engine recorded 506–931 new branches per world, including branches that later died out. A new branch requires at least two generations since its lineage reference and an RMS locus distance of at least 0.11 from that reference. The label aids ancestry navigation. Across the 12 zero-mutation worlds, 33–226 individuals remained, with one to three surviving founder genomes and zero new branches.

For each of two assay placements per seed, each donor and the original seed-matched founder pool supplied 48 sampled genomes to both a fresh jade and a fresh amber world. Within an origin and placement block, both gardens received identical genomes in the same order. Across origins, worlds started at the same position, angle, age, and fractional stored energy for each slot, with storage capacity following genome size. Assays ran at zero mutation. A donor with fewer than 48 survivors cycled its shuffled genomes, ensuring equal starting population. An extinct donor would have an unavailable assay.

The primary response is living organisms at tick 360 per initial founder, including surviving founders. Within each test environment we subtract away-trained performance from home-trained performance and average the two differences. Each row averages the two placements within one training seed. Positive values favor the home-trained pool. The zero-mutation arms show the contribution of sorting among standing founder genomes. The additional advantage with mutation can reflect new variants, changes in genetic diversity, and population interactions. These are descriptive comparisons of six seed pairs. Seeds pair founder and terrain initialization. Subsequent random draws can differ as populations diverge and mutations consume draws.

| Seed | Home advantage, mutation on | Home advantage, mutation off | Gut equalized in evolved pools |
| --- | ---: | ---: | ---: |
| 17 | 6.573 | 2.406 | 0.057 |
| 31 | 6.026 | 2.635 | −0.031 |
| 73 | 6.719 | 2.740 | −0.078 |
| 101 | 7.135 | 2.911 | 0.036 |
| 211 | 6.245 | 1.677 | 0.000 |
| 307 | 6.594 | 2.854 | 0.010 |
| Mean | **6.549** | **2.537** | **−0.001** |

The mean on-minus-off home advantage was 4.011 living organisms per founder. Unedited evolved home gardens averaged about 352 individuals in jade and 366 in amber. Unedited ancestral gardens averaged about 38 and 36, respectively. The receipt contains both placements, both environments, outcomes at ticks 180 and 360, and separate results using living offspring and cumulative births. Restricting the numerator to living offspring gives a home advantage of 6.338 with mutation on and 2.372 with it off.

Mean gut locus at tick 4,800 was 0.097 in jade and 0.903 in amber, versus 0.500 in the founding pools. A follow-up equalized the gut locus at 0.5 in both evolved pools at assay entry, holding the rest of each genome fixed. The home advantage fell to effectively zero. Another assay replaced only the motor-controller loci with the seed-matched shuffled founder loci. Home advantage remained 5.355, while home gardens averaged about 289 in jade and 279 in amber. These edits support the digestive locus as the principal cause of the resource-specific advantage in this assay. The controller replacement changes the linkage between inherited traits, so its effect combines changes in the controller and its compatibility with the rest of the genome. [Full selection, garden, and pulse data](ecology.json)

## Spatial sorting in a balanced world

An exploratory follow-up used the same six seeds and paired mutation settings with both nutrient channels replenished across the spatial mosaic. At ticks 0, 4,800, 9,600 and 14,400 we counted organisms in low, middle and high thirds of the gut locus, and recorded the initial jade share of the tile each occupied. The initial share reflects habitat supply before organisms feed or deplete it.

Five mutation-enabled cultures survived. Each retained both extremes at all three later samples. At tick 14,400, the living cultures had 91–113 low-gut and 92–157 high-gut individuals. Low-gut individuals were in tiles with mean initial jade shares of 0.61–0.63. High-gut individuals were in tiles with shares of 0.34–0.45. The paired difference averaged 23.46 percentage points across the five surviving cultures. One culture showed the reverse pattern at tick 4,800, with only three high-gut individuals. All five survivors had the expected direction by tick 9,600. Seed 31 with mutation went extinct. One of the six mutation-disabled worlds still held both extremes at the last sample. The result shows spatial sorting of inherited feeding traits and their co-occurrence over the observed period. Resolving the contribution of continual mutation to that coexistence would require turning it off after diversification. [Mosaic data](mosaic.json)

## Resource pulse and predation

For each of the six seeds, an amber-renewal world switched to jade renewal at tick 1,200. Its paired amber control started identically and continued with amber renewal. Constant jade provided a reference. Three 600-tick windows covered the period before intervention and early and late responses. Flows are differences in cumulative assimilated energy from the two nutrient channels and prey.

At tick 2,400 the switched cultures had 0–95 survivors and the paired amber controls had 170–248. Switched seed 307 went extinct after assimilating energy in the final observation window. Late-window jade share rose by **71.85 percentage points** across the six pairs. The prey share fell in every pair, by a mean of **0.39 percentage points**. The intervention directly changes substrate supply, so uptake measures the ecological response. Similarly, the contact-feeding mechanism produced measured prey bites and energy transfers. In the late halves of the selection runs, prey supplied only about 0.81% of absorbed energy in jade and 0.31% in amber with mutation enabled. Mean jaw loci fell from 0.499 in the founders to 0.093 in jade and 0.087 in amber. These conditions favored grazing, including among organisms with the ability to bite. The evidence for ecological structure comes from inherited resource use and spatial sorting. [Transfer data](ecology.json)

## Long run and profiling

One balanced seed-73 world ran **620,000 ticks**. We independently walked the deepest living individual's complete ancestry through **2,506 parent-child links**, verifying 2,507 records and their birth order. The world completed 398,681 births and finished at 302 inhabitants. Sampled population ranged from 22 to 329. The engine keeps ancestor and branch records for inspection, so memory grows with cumulative births. Peak sampled process RSS was 481 MiB.

Every 256 ticks the run scanned resource fields, genomes, live coordinates and vital values. It verified population conservation and checked the energy ledger to within 1e-8 of initial stored energy plus cumulative regenerated energy. The largest measured normalized energy residual was 1.72e-12. Extrema are from sampled states. Summed engine stepping took 76.9 seconds on an Apple M4 with Node 24.22.1, with concurrent work during part of the run. [Stability data](stability.json)

The standalone benchmark warmed each of three configurations for 1,200 ticks, then measured 18,000 ticks in 60-tick batches per configuration. On the same machine, median batch time per tick ranged from 0.117 to 0.148 ms and the largest p95 batch mean was 0.162 ms. Observed populations ranged from 70 to 365. The headless timings cover engine stepping. [Benchmark](benchmark.json)

An early V8 profile attributed 34% of sampled self time to coordinate wrapping. We specialized integer wrapping for the spatial search buckets. In a separate unchanged-tape comparison, seed `cambrian` warmed for 2,400 ticks and ran 20,000 measured ticks in each arm. The two old timings were 2.106 and 2.143 seconds; the two optimized ones were 1.729 and 1.736 seconds. The final serialized population, live organism records, branch records and energy budget had the same digest. In the final 4,700-sample profile, continuous coordinate wrapping used 26.9% of sampled self time, neighbor lookup 25.6%, and the agent step itself 17.3%. Raw profiles contain local paths and belong in `output/`. [Profile summary](profile.json)

## Calibration history

The initial balanced seed 73 fell from 96 founders to three individuals by tick 1,200 and went extinct before tick 2,400. Two early amber donor arms for seed 307 also went extinct. A retune reduced basal and movement costs, reduced storage and absolute reproductive thresholds, and increased feeding capacity. In the retuned prototype, balanced seed 73 reached 202 by tick 4,800. We then replaced fixed behavioral choices with inherited signed controller weights. A later browser replay exposed a trajectory mismatch from the runtimes’ native trigonometric arithmetic. We added fixed engine math and reran the experiments. On 2026-11-19, review found that an organism crossing a tile boundary stayed in its old search bucket until the next tick. Later organisms in the same tick could miss it despite querying current positions. The correction updates the bucket during movement. We repeated all experiments on the corrected engine with the original seeds and protocols. The calibration receipt preserves measurements and engine digests for the superseded prototypes. [Calibration data](calibration.json)
