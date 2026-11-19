'use strict';
function randomSource(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const specimens = {
  jar: [
    'Banded water jar',
    'Ceramic',
    'Two ochre bands circle the shoulder. A tide mark inside the neck records its last contents.',
  ],
  quern: [
    'Saddle quern',
    'Basalt',
    'The hollow working face carries cereal polish. Flour collected in the deeper pits.',
  ],
  seal: [
    'Reed seal',
    'Fired clay',
    'Parallel reed impressions cross the reverse. The obverse retains the stamp used to close a grain bin.',
  ],
  weight: [
    'Pierced trade weight',
    'Stone',
    'A cord groove circles the drilled eye. Its mass matches the measure impressed on the quay tally.',
  ],
  tally: [
    'Exchange tally',
    'Clay tablet',
    'Repeated wedge marks count outgoing grain and incoming stone. Clay from the riverbank still fills one incision.',
  ],
  silt: [
    'Laminated silt core',
    'Alluvium',
    'Fine, even bands seal the quay paving. Their diminishing grain size records a channel losing its current.',
  ],
  salt: [
    'Salt-crusted bowl',
    'Ceramic',
    'A thick mineral crust rises above the firing line. Water evaporated here repeatedly.',
  ],
  plug: [
    'Channel stop',
    'Limestone',
    'A tapered block fits the mouth of a narrow feed channel. Tool marks show it was cut down to redirect the remaining flow.',
  ],
  latch: [
    'Removed door pin',
    'Bronze',
    'The shaft is straight and the hinge end is polished. Someone lifted the door before leaving.',
  ],
};
const sectors = ['Water court', 'Granary terrace', 'River landing'];
function simulate(seed) {
  seed = Number(seed) >>> 0;
  const r = randomSource(seed),
    geo = { rain: 0.72 + r() * 0.24, gradient: r(), clay: 0.85 + r() * 0.15 };
  let people = 20 + Math.floor(r() * 10),
    grain = 0,
    silt = 0,
    water = 1,
    trade = 0,
    year = 0,
    phase = 0,
    low = 0;
  let quay, bin, court, pressure, repair, pin;
  const events = [],
    frames = [];
  function record(type, title, detail, zone, causes = [], object = null, construct = null) {
    const id = events.length;
    events.push({
      id,
      year,
      phase,
      type,
      title,
      detail,
      zone,
      causes,
      object,
      construct,
      people,
      water,
      grain,
      trade,
    });
    return id;
  }
  const founding = record(
    'settle',
    'A terrace above the river',
    'Households settle the clay-rich bank and grind their first cereal harvest.',
    1,
    [],
    'quern',
    'hearth',
  );
  for (year = 5; year <= 1200; year += 5) {
    silt += 0.008 + (0.9 - geo.gradient) * 0.004;
    const aridity = Math.max(0, year - (270 + geo.gradient * 55)) * 0.01;
    water = Math.max(0.05, 1 - (geo.gradient < 0.54 ? Math.max(0, silt - 0.65) * 3.8 : aridity));
    grain += Math.max(0, (geo.rain * water - 0.47) * people * 0.32);
    if (water > 0.58) people += 1 + Math.floor(r() * 3);
    if (bin === undefined && grain >= 40) {
      bin = record(
        'build',
        'Grain under seal',
        'A surplus pays for a raised storehouse. Keepers seal the grain bins with local clay.',
        1,
        [founding],
        'seal',
        'granary',
      );
    }
    if (bin !== undefined && quay === undefined && grain > 145) {
      phase = 1;
      quay = record(
        'build',
        'The landing opens',
        'The storehouse surplus supports a stone landing. Boat crews weigh cargo at the new quay.',
        2,
        [bin],
        'weight',
        'quay',
      );
    }
    if (quay !== undefined && water > 0.6) {
      trade += Math.floor(water * 5);
      grain -= 1;
    }
    if (court === undefined && trade >= 65) {
      court = record(
        'build',
        'The water court',
        'Tolls from passing boats fund a columned court above the quay. Its clerk records grain exchanges.',
        0,
        [quay],
        'tally',
        'court',
      );
    }
    if (water < 0.63 && pressure === undefined && court !== undefined) {
      phase = 2;
      pressure =
        geo.gradient < 0.54
          ? record(
              'avulsion',
              'The river turns',
              'Sediment chokes the landing. The main current takes a lower course beyond the terrace.',
              2,
              [quay],
              'silt',
            )
          : record(
              'drought',
              'The basin dries',
              'Falling rainfall concentrates salts in the court cistern and leaves the quay too shallow for boats.',
              0,
              [court],
              'salt',
            );
    }
    if (pressure !== undefined && repair === undefined && water < 0.48) {
      repair = record(
        'adapt',
        'A narrower intake',
        'Masons block a branch of the feeder to concentrate the remaining water at the court.',
        0,
        [court, pressure],
        'plug',
        'intake',
      );
    }
    if (water < 0.4) {
      low++;
      people = Math.max(1, people - 6);
    }
    if (low >= 5 && pin === undefined && repair !== undefined) {
      phase = 3;
      pin = record(
        'depart',
        'The doors come down',
        'With water scarce, households take the storehouse doors for reuse. One hinge pin remains.',
        1,
        [repair, bin],
        'latch',
      );
    }
    if (pin !== undefined && people <= 8) {
      people = 0;
      record(
        'abandon',
        'An empty terrace',
        'The last water carriers leave a banded jar beside the court. Windblown soil begins to settle.',
        0,
        [pin],
        'jar',
      );
      break;
    }
    frames.push({ year, people, water, grain, trade });
  }
  const last = events.at(-1),
    starts = [0, events[quay].year, events[pressure].year, events[pin].year];
  const names = [
    'Foundation earth',
    'Occupation fill',
    geo.gradient < 0.54 ? 'River silt' : 'Saline dust',
    'Surface mantle',
  ];
  const deposits = starts.map((start, i) => ({
    start,
    end: (starts[i + 1] ?? last.year + 1) - 1,
    name: names[i],
    origin: events.find((e) => e.phase === i).id,
  }));
  let depth = 0;
  for (let i = 3; i >= 0; i--) {
    const d = deposits[i];
    d.top = depth;
    depth += Math.round((d.end - d.start + 1) * (i === 2 ? 1.05 : 0.46) + 10);
    d.bottom = depth;
  }
  const finds = events
    .filter((e) => e.object)
    .map((e, i) => {
      const d = deposits[e.phase],
        frac = (d.end - e.year) / (d.end - d.start + 1);
      return {
        id: 'AS-' + String(i + 1).padStart(3, '0'),
        kind: e.object,
        origin: e.id,
        zone: e.zone,
        layer: e.phase,
        depth: Math.round(d.top + frac * (d.bottom - d.top)),
      };
    });
  // Post-occupation exposure strips roofs and erodes courses above local cover.
  // A landing sealed by fine silt retains more of its paving than a desiccated quay.
  const abandonment = last.id,
    exposedYears = 175 + Math.round((1 - geo.clay) * 420);
  const buildings = events
    .filter((e) => e.construct)
    .map((e) => {
      const useYears = last.year - e.year,
        zoneCover =
          deposits[e.phase].top / (e.zone === 2 && events[pressure].type === 'avulsion' ? 160 : 240);
      const wear = useYears * 0.00042 + exposedYears * 0.0016 - zoneCover * 0.085;
      return {
        type: e.construct,
        origin: e.id,
        zone: e.zone,
        abandonment,
        useYears,
        burialCm: Math.round(zoneCover * 45),
        survival: Math.max(0.31, Math.min(0.87, 1 - wear)),
      };
    });
  return {
    seed,
    geo,
    events,
    frames,
    buildings,
    deposits,
    finds,
    exposedYears,
    cause: events[pressure].type,
  };
}
if (typeof module !== 'undefined') module.exports = { simulate, randomSource, specimens, sectors };
