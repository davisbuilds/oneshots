'use strict';

(() => {
  const GENES = Object.freeze(['size', 'aspect', 'fins', 'tail', 'armor', 'spines', 'jaw', 'gut',
    'vision', 'chemotaxis', 'pursuit', 'throttle', 'turning', 'fertility', 'longevity',
    'turnBias', 'thrustHunger', 'thrustChemistry', 'thrustNeighbor',
    'grazeBias', 'grazeHunger', 'grazeChemistry', 'grazeNeighbor',
    'graspBias', 'graspHunger', 'graspChemistry', 'graspNeighbor']);
  const ENVIRONMENTS = Object.freeze(['balanced', 'amber', 'jade']);
  const DEFAULT_SEED = 'cambrian';
  const TILE = 24;
  const SUBSTRATE_CAPACITY = 3.2;
  const TWO_PI = 2 * Math.PI;
  const HALF_PI = Math.PI / 2;
  const QUARTER_PI = Math.PI / 4;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const wrap = (value, size) => (value % size + size) % size;
  const wrapCell = (value, span) => value < 0 ? value + span : value >= span ? value - span : value;
  const delta = (value, size) => value - Math.round(value / size) * size;

  const signed = (locus) => 2 * locus - 1;

  // The JavaScript runtime supplies implementation-dependent transcendental
  // functions. Keep replay arithmetic fixed, including when Chrome and Node
  // select different native implementations for the same operation.
  function sine(angle) {
    let x = delta(angle, TWO_PI);
    if (x > HALF_PI) x = Math.PI - x;
    else if (x < -HALF_PI) x = -Math.PI - x;
    const x2 = x * x;
    let p = 1 / 51090942171709440000;
    p = -1 / 121645100408832000 + x2 * p;
    p = 1 / 355687428096000 + x2 * p;
    p = -1 / 1307674368000 + x2 * p;
    p = 1 / 6227020800 + x2 * p;
    p = -1 / 39916800 + x2 * p;
    p = 1 / 362880 + x2 * p;
    p = -1 / 5040 + x2 * p;
    p = 1 / 120 + x2 * p;
    p = -1 / 6 + x2 * p;
    return x + x * x2 * p;
  }

  const cosine = (angle) => sine(angle + HALF_PI);

  function direction(y, x) {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax === 0 && ay === 0) return 0;
    const steep = ay > ax;
    const ratio = steep ? ax / ay : ay / ax;
    // Octant reduction keeps the series input within ±tan(π/8).
    const shifted = ratio > 0.41421356237309505;
    const r = shifted ? (ratio - 1) / (ratio + 1) : ratio;
    const r2 = r * r;
    let p = -1 / 31;
    p = 1 / 29 + r2 * p;
    p = -1 / 27 + r2 * p;
    p = 1 / 25 + r2 * p;
    p = -1 / 23 + r2 * p;
    p = 1 / 21 + r2 * p;
    p = -1 / 19 + r2 * p;
    p = 1 / 17 + r2 * p;
    p = -1 / 15 + r2 * p;
    p = 1 / 13 + r2 * p;
    p = -1 / 11 + r2 * p;
    p = 1 / 9 + r2 * p;
    p = -1 / 7 + r2 * p;
    p = 1 / 5 + r2 * p;
    p = -1 / 3 + r2 * p;
    let angle = r + r * r2 * p + (shifted ? QUARTER_PI : 0);
    if (steep) angle = HALF_PI - angle;
    if (x < 0) angle = Math.PI - angle;
    return y < 0 ? -angle : angle;
  }

  function logShare(share) {
    let exponent = 0;
    while (share < 1) {
      share *= 2;
      exponent--;
    }
    // ln(u) = 2 atanh((u - 1) / (u + 1)), with u in [1, 2).
    const r = (share - 1) / (share + 1);
    const r2 = r * r;
    let sum = 0;
    for (let divisor = 31; divisor > 0; divisor -= 2) sum = 1 / divisor + sum * r2;
    return 2 * r * sum + exponent * 0.6931471805599453;
  }

  const square = (x) => x * x;
  const distanceFromOrigin = (x, y) => Math.sqrt(square(x) + square(y));

  function seededRandom(seed) {
    let state = 2166136261;
    for (const character of String(seed)) state = Math.imul(state ^ character.codePointAt(0), 16777619);
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let word = Math.imul(state ^ state >>> 15, 1 | state);
      word ^= word + Math.imul(word ^ word >>> 7, 61 | word);
      return ((word ^ word >>> 14) >>> 0) / 4294967296;
    };
  }

  function traits(genome) {
    const [size, shape, fins, tail, armor, spines, jaw, gut, vision, chemotaxis, pursuit,
      throttle, turning, fertility, longevity, turnBias, thrustHunger, thrustChemistry, thrustNeighbor,
      grazeBias, grazeHunger, grazeChemistry, grazeNeighbor,
      graspBias, graspHunger, graspChemistry, graspNeighbor] = genome;
    const radius = 3 + 6 * size;
    const aspect = 0.65 + 1.4 * shape;
    const load = 0.75 + 0.63 * size + 0.44 * armor;
    const grazeEfficiency = 1 - 0.41 * jaw;
    const generalism = 0.06 * (1 - 2 * Math.abs(gut - 0.5));
    return {
      size, radius, aspect, fins, tail, armor, spines, jaw, gut, vision, chemotaxis, pursuit,
      throttle, turning, fertility, longevity,
      controller: {
        turnBias: signed(turnBias) * 0.32, turnChemistry: signed(chemotaxis) * 2.5, turnBearing: signed(pursuit) * 1.9,
        thrustBias: 0.55 + signed(throttle) * 0.47, thrustHunger: signed(thrustHunger) * 0.49,
        thrustChemistry: signed(thrustChemistry) * 0.30, thrustNeighbor: signed(thrustNeighbor) * 0.32,
        grazeBias: 0.62 + signed(grazeBias) * 0.59, grazeHunger: signed(grazeHunger) * 0.48,
        grazeChemistry: signed(grazeChemistry) * 0.39, grazeNeighbor: signed(grazeNeighbor) * 0.42,
        graspBias: -0.25 + signed(graspBias) * 0.73, graspHunger: signed(graspHunger) * 0.56,
        graspChemistry: signed(graspChemistry) * 0.57, graspNeighbor: signed(graspNeighbor) * 0.73,
      },
      speed: (0.9 + 2.95 * tail + 0.55 * fins + 0.85 * shape) / load,
      agility: (0.07 + 0.25 * turning) * (0.55 + fins) / (0.68 + 0.55 * size),
      senses: 11 + 25 * vision,
      maxEnergy: 21 + 25.5 * size,
      basalCost: 0.72 * (0.028 + 0.051 * size + 0.021 * armor + 0.017 * spines +
        0.017 * vision + 0.012 * jaw + 0.018 * longevity + 0.014 * fins),
      youngAge: 16 + Math.floor(22 * (1 - fertility) + 14 * size),
      lifeSpan: 235 + Math.floor(265 * longevity + 115 * size - 68 * fertility),
      reproductionAt: 0.62 + 0.2 * (1 - fertility),
      jadeEfficiency: (0.14 + 0.79 * (1 - gut) + generalism) * grazeEfficiency,
      amberEfficiency: (0.14 + 0.79 * gut + generalism) * grazeEfficiency,
    };
  }

  function distanceSquared(a, b) {
    let squared = 0;
    for (let i = 0; i < GENES.length; i++) squared += square(a[i] - b[i]);
    return squared / GENES.length;
  }

  function validateEnvironment(environment) {
    if (!ENVIRONMENTS.includes(environment)) throw new RangeError(`Unknown environment ${environment}`);
  }

  class World {
    constructor({seed = DEFAULT_SEED, mutation = 1, environment = 'balanced', founders} = {}) {
      validateEnvironment(environment);
      if (mutation === true || mutation === false) mutation = Number(mutation);
      if (!Number.isFinite(mutation) || mutation < 0 || mutation > 2) {
        throw new RangeError('Mutation strength must be in [0, 2]');
      }
      if (founders !== undefined && (!Array.isArray(founders) || founders.some((genome) =>
        !Array.isArray(genome) || genome.length !== GENES.length ||
        Array.from(genome).some((locus) => !Number.isFinite(locus) || locus < 0 || locus > 1)))) {
        throw new RangeError(`Each founder needs ${GENES.length} loci in [0, 1]`);
      }
      this.seed = seed;
      this.mutation = mutation;
      this.environment = environment;
      this.width = 960;
      this.height = 600;
      this.cols = this.width / TILE;
      this.rows = this.height / TILE;
      this.tick = 0;
      this.organisms = [];
      this.lineages = [];
      this.events = [];
      this._pedigree = [null];
      this._living = new Map();
      this._births = 0;
      this._deaths = 0;
      this._maxGeneration = 0;
      this._predation = 0;
      this._diet = {jade: 0, amber: 0, prey: 0};
      this._regenerated = 0;
      this._burned = 0;
      this._spoiled = 0;
      this._random = seededRandom(seed);
      this._initializeField(seededRandom(`${seed}/substrate`));
      this._initializeFounders(founders, seededRandom(`${seed}/founders`));
      this.initialPopulation = this.organisms.length;
      const {jade, amber, biomass} = this.budget();
      this._initial = jade + amber + biomass;
    }

    _initializeField(random) {
      const cells = this.cols * this.rows;
      this.jade = new Float64Array(cells);
      this.amber = new Float64Array(cells);
      this._terrain = new Float64Array(cells);
      this._jadeCapacity = new Float64Array(cells);
      this._heads = new Int32Array(cells);
      const phases = Array.from({length: 4}, () => random() * TWO_PI);
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const x = TWO_PI * col / this.cols;
          const y = TWO_PI * row / this.rows;
          const i = row * this.cols + col;
          this._terrain[i] = clamp(0.5 + 0.27 * sine(2 * x + y + phases[0]) +
            0.23 * cosine(2 * y - x + phases[1]) + 0.14 * sine(3 * x + 2 * y + phases[2]) +
            0.08 * sine(4 * y + phases[3]), 0.035, 0.965);
        }
      }
      this._setCapacities();
      for (let i = 0; i < cells; i++) {
        const abundance = 0.62 + 0.37 * random();
        this.jade[i] = this._jadeCapacity[i] * abundance;
        this.amber[i] = (SUBSTRATE_CAPACITY - this._jadeCapacity[i]) * abundance;
      }
    }

    _setCapacities() {
      for (let i = 0; i < this._terrain.length; i++) {
        const localShare = this._terrain[i];
        let jadeShare = localShare;
        if (this.environment === 'jade') jadeShare = 0.72 + 0.24 * localShare;
        if (this.environment === 'amber') jadeShare = 0.04 + 0.24 * localShare;
        this._jadeCapacity[i] = SUBSTRATE_CAPACITY * jadeShare;
      }
    }

    _initializeFounders(founders, random) {
      const count = founders?.length ?? 96;
      const columns = Math.max(1, Math.ceil(Math.sqrt(count * this.width / this.height)));
      const rows = Math.max(1, Math.ceil(count / columns));
      const foundingGenes = seededRandom(`${this.seed}/inherited`);
      for (let i = 0; i < count; i++) {
        const genome = founders ? founders[i].slice() : GENES.map(() => 0.06 + 0.88 * foundingGenes());
        const body = traits(genome);
        const x = (i % columns + 0.16 + 0.68 * random()) * this.width / columns;
        const y = (Math.floor(i / columns) + 0.16 + 0.68 * random()) * this.height / rows;
        const angle = random() * TWO_PI;
        const energy = body.maxEnergy * (0.45 + 0.17 * random());
        const age = Math.floor(30 * random());
        this.organisms.push(this._createOrganism({genome, body, x, y, angle, energy, age}));
      }
    }

    _createOrganism({genome, body, x, y, angle, energy, age = 0, parent = null}) {
      const id = this._pedigree.length;
      const parentId = parent?.id ?? null;
      const generation = parent ? parent.generation + 1 : 0;
      let lineage = parent ? this.lineages[parent.lineage - 1] : null;
      // Divergence has no role in mate choice, foraging, or reproduction.
      // The clade labels only record inherited distances after birth.
      if (!lineage || (generation >= lineage.generation + 2 && distanceSquared(genome, lineage.genome) >= 0.0121)) {
        lineage = {
          id: this.lineages.length + 1, parentId: lineage?.id ?? null, founderId: id,
          origin: this.tick, extinct: null, living: 0, births: 0, generation, genome,
        };
        this.lineages.push(lineage);
        if (parent) this._record('divergence', id, lineage.id, {parentLineage: lineage.parentId});
      }
      lineage.living++;
      lineage.births++;
      const pedigree = {id, parentId, lineage: lineage.id, generation, birth: this.tick, death: null};
      const organism = {
        ...pedigree, genome, traits: body, x, y, angle, energy, age,
        action: 'swimming', feed: null, intake: 0, spent: 0, lastIntake: 0, lastSpent: 0,
        offspring: 0, offspringEnergy: 0, nextBirth: 0, speed: 0,
        _binPrev: -1, _binNext: -1, _cause: null,
      };
      this._pedigree.push(pedigree);
      this._living.set(id, organism);
      this._maxGeneration = Math.max(this._maxGeneration, generation);
      return organism;
    }

    action(environment) {
      validateEnvironment(environment);
      if (environment !== this.environment) {
        this.environment = environment;
        this._setCapacities();
        this._record('environment', null, null, {environment});
      }
      return this;
    }

    _record(type, organismId, lineage, extra = {}) {
      this.events.push({tick: this.tick, type, organismId, lineage, ...extra});
      if (this.events.length > 256) this.events.shift();
    }

    _cell(x, y) {
      return Math.floor(wrap(y, this.height) / TILE) * this.cols + Math.floor(wrap(x, this.width) / TILE);
    }

    fieldAt(x, y) {
      const index = this._cell(x, y);
      return [this.jade[index] / SUBSTRATE_CAPACITY, this.amber[index] / SUBSTRATE_CAPACITY];
    }

    _renewField() {
      let input = 0;
      let decay = 0;
      for (let i = 0; i < this.jade.length; i++) {
        const jadeGap = this._jadeCapacity[i] - this.jade[i];
        const amberGap = SUBSTRATE_CAPACITY - this._jadeCapacity[i] - this.amber[i];
        const jadeChange = jadeGap * (jadeGap > 0 ? 0.022 : 0.035);
        const amberChange = amberGap * (amberGap > 0 ? 0.022 : 0.035);
        this.jade[i] += jadeChange;
        this.amber[i] += amberChange;
        input += Math.max(0, jadeChange) + Math.max(0, amberChange);
        decay += Math.min(0, jadeChange) + Math.min(0, amberChange);
      }
      this._regenerated += input;
      this._spoiled -= decay;
    }

    _indexOrganisms() {
      this._heads.fill(-1);
      for (let i = 0; i < this.organisms.length; i++) {
        const organism = this.organisms[i];
        this._linkCell(i, this._cell(organism.x, organism.y));
        organism.lastIntake = 0;
        organism.lastSpent = 0;
        organism.feed = null;
      }
    }

    _linkCell(index, cell) {
      const organism = this.organisms[index];
      const head = this._heads[cell];
      organism._binPrev = -1;
      organism._binNext = head;
      if (head >= 0) this.organisms[head]._binPrev = index;
      this._heads[cell] = index;
    }

    _moveBetweenCells(index, from, to) {
      const {_binPrev: previous, _binNext: next} = this.organisms[index];
      if (previous >= 0) this.organisms[previous]._binNext = next;
      else this._heads[from] = next;
      if (next >= 0) this.organisms[next]._binPrev = previous;
      this._linkCell(index, to);
    }

    _neighbor(organism) {
      const {x, y, traits: body} = organism;
      const left = Math.floor((x - body.senses) / TILE);
      const right = Math.floor((x + body.senses) / TILE);
      const top = Math.floor((y - body.senses) / TILE);
      const bottom = Math.floor((y + body.senses) / TILE);
      let closest = null;
      let bestDistance = square(body.senses);
      for (let row = top; row <= bottom; row++) {
        const rowStart = wrapCell(row, this.rows) * this.cols;
        for (let col = left; col <= right; col++) {
          for (let i = this._heads[rowStart + wrapCell(col, this.cols)]; i >= 0; i = this.organisms[i]._binNext) {
            const other = this.organisms[i];
            if (other === organism || other.energy <= 0) continue;
            const dx = delta(other.x - x, this.width);
            const dy = delta(other.y - y, this.height);
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
              bestDistance = distance;
              closest = other;
            }
          }
        }
      }
      return closest;
    }

    _availableFood(i, body) {
      return this.jade[i] * body.jadeEfficiency + this.amber[i] * body.amberEfficiency;
    }

    _burn(organism, amount) {
      const spent = Math.min(organism.energy, amount);
      organism.energy -= spent;
      organism.spent += spent;
      organism.lastSpent += spent;
      this._burned += spent;
    }

    _eat(organism, energy, source) {
      organism.energy += energy;
      organism.intake += energy;
      organism.lastIntake += energy;
      organism.feed = source;
      this._diet[source] += energy;
    }

    _bite(organism, prey, noseX, noseY, effort) {
      const body = organism.traits;
      const defense = prey.traits;
      const dx = delta(prey.x - organism.x, this.width);
      const dy = delta(prey.y - organism.y, this.height);
      const distance = distanceFromOrigin(dx, dy);
      const reach = body.radius * (0.72 + 0.16 * body.aspect) + defense.radius + 2;
      if (distance >= reach || noseX * dx + noseY * dy < -distance * 0.40) return false;
      const efficiency = 0.62 + 0.19 * body.jaw;
      const damage = effort * (0.28 + 2.35 * body.jaw) * (0.65 + 0.55 * body.size) *
        (1 - 0.50 * defense.armor - 0.22 * defense.spines);
      const transfer = Math.min(damage, prey.energy, (body.maxEnergy - organism.energy) / efficiency);
      if (transfer <= 0) return false;
      prey.energy -= transfer;
      prey.spent += transfer;
      prey.lastSpent += transfer;
      const gain = transfer * efficiency;
      this._eat(organism, gain, 'prey');
      this._burned += transfer - gain;
      this._burn(organism, effort * (0.013 + 0.045 * defense.spines));
      this._predation++;
      if (prey.energy === 0) {
        prey._cause = 'preyed upon';
        this._record('predation', organism.id, organism.lineage, {preyId: prey.id, preyLineage: prey.lineage});
      }
      return true;
    }

    _graze(organism, effort, i) {
      const body = organism.traits;
      // Both substrates pass through the same inherited capture apparatus.
      // Saturation and tissue affinity determine how much of each is absorbed.
      const jadeAffinity = this.jade[i] / (0.24 + this.jade[i]) * square(body.jadeEfficiency);
      const amberAffinity = this.amber[i] / (0.24 + this.amber[i]) * square(body.amberEfficiency);
      const mouth = (0.67 + 1.31 * body.size) * (1 - 0.41 * body.jaw);
      const harvest = effort * mouth / (0.20 + jadeAffinity + amberAffinity);
      let jadeTaken = Math.min(this.jade[i], harvest * jadeAffinity);
      let amberTaken = Math.min(this.amber[i], harvest * amberAffinity);
      const potential = jadeTaken * body.jadeEfficiency + amberTaken * body.amberEfficiency;
      if (potential <= 0) return false;
      const space = Math.min(1, (body.maxEnergy - organism.energy) / potential);
      if (space <= 0) return false;
      jadeTaken *= space;
      amberTaken *= space;
      const jadeGain = jadeTaken * body.jadeEfficiency;
      const amberGain = amberTaken * body.amberEfficiency;
      this.jade[i] -= jadeTaken;
      this.amber[i] -= amberTaken;
      this._eat(organism, jadeGain, 'jade');
      this._eat(organism, amberGain, 'amber');
      organism.feed = jadeGain >= amberGain ? 'jade' : 'amber';
      this._burned += jadeTaken + amberTaken - jadeGain - amberGain;
      return true;
    }

    _act(index) {
      const organism = this.organisms[index];
      if (organism.energy <= 0) return;
      const body = organism.traits;
      const control = body.controller;
      const hunger = 1 - organism.energy / body.maxEnergy;
      const fromCell = this._cell(organism.x, organism.y);
      const food = this._availableFood(fromCell, body) / SUBSTRATE_CAPACITY;
      const neighbor = this._neighbor(organism);
      let proximity = 0;
      let bearing = 0;
      if (neighbor) {
        const dx = delta(neighbor.x - organism.x, this.width);
        const dy = delta(neighbor.y - organism.y, this.height);
        proximity = 1 - distanceFromOrigin(dx, dy) / body.senses;
        bearing = delta(direction(dy, dx) - organism.angle, TWO_PI) / Math.PI;
      }
      const far = 9 + 20 * body.vision;
      const left = organism.angle - 0.67;
      const right = organism.angle + 0.67;
      const leftFood = this._availableFood(this._cell(organism.x + far * cosine(left), organism.y + far * sine(left)), body);
      const rightFood = this._availableFood(this._cell(organism.x + far * cosine(right), organism.y + far * sine(right)), body);
      const gradient = (rightFood - leftFood) / SUBSTRATE_CAPACITY;
      const steering = control.turnBias + control.turnChemistry * gradient +
        control.turnBearing * bearing * proximity + (this._random() - 0.5) * 0.32;
      const thrust = clamp(control.thrustBias + control.thrustHunger * hunger +
        control.thrustChemistry * food + control.thrustNeighbor * proximity, 0.02, 1.1);
      const graze = clamp(control.grazeBias + control.grazeHunger * hunger +
        control.grazeChemistry * food + control.grazeNeighbor * proximity, 0, 1);
      const grasp = clamp(control.graspBias + control.graspHunger * hunger +
        control.graspChemistry * food + control.graspNeighbor * proximity, 0, 1);
      organism.angle = wrap(organism.angle + clamp(steering, -1, 1) * body.agility, TWO_PI);
      const forwardX = cosine(organism.angle);
      const forwardY = sine(organism.angle);
      const speed = body.speed * thrust;
      organism.speed = speed;
      organism.x = wrap(organism.x + forwardX * speed, this.width);
      organism.y = wrap(organism.y + forwardY * speed, this.height);
      const toCell = this._cell(organism.x, organism.y);
      // Later turns sense the current world, including swimmers that have
      // already moved. Organism indices are stable until every turn ends.
      if (toCell !== fromCell) this._moveBetweenCells(index, fromCell, toCell);
      organism.age++;
      const gotPrey = neighbor && grasp > 0 && this._bite(organism, neighbor, forwardX, forwardY, grasp);
      const gotFood = graze > 0 && this._graze(organism, graze * (1 - grasp), toCell);
      if (gotPrey) organism.feed = 'prey';
      organism.action = gotPrey ? 'hunting' : gotFood ? 'grazing' : 'swimming';
      const drag = 0.72 * (0.007 + 0.012 * body.size + 0.009 * body.armor) / (0.70 + 0.42 * body.aspect);
      this._burn(organism, body.basalCost + square(speed) * drag + 0.012 * grasp);
    }

    _mutate(genome) {
      return genome.map((locus) => {
        if (this.mutation === 0 || this._random() >= 0.23 * this.mutation) return locus;
        const variation = (this._random() + this._random() - 1) * (0.28 + 0.09 * this.mutation);
        const shifted = locus + variation;
        // Reflection keeps mutation unbiased toward allele boundaries.
        return shifted < 0 ? -shifted : shifted > 1 ? 2 - shifted : shifted;
      });
    }

    _reproduce(parent) {
      const body = parent.traits;
      const genome = this._mutate(parent.genome);
      const childBody = traits(genome);
      const angle = wrap(parent.angle + (this._random() - 0.5) * 3.2, TWO_PI);
      const offset = parent.angle + Math.PI + (this._random() - 0.5);
      const distance = body.radius + childBody.radius + 1;
      const x = wrap(parent.x + cosine(offset) * distance, this.width);
      const y = wrap(parent.y + sine(offset) * distance, this.height);
      const energy = Math.min(childBody.maxEnergy * 0.50, parent.energy * 0.49);
      const cost = 1.8 + 2.4 * body.fertility + 1.25 * childBody.size;
      parent.energy -= energy;
      this._burn(parent, cost);
      parent.offspring++;
      parent.offspringEnergy += energy;
      parent.nextBirth = this.tick + 13 + Math.floor(19 * (1 - body.fertility));
      const child = this._createOrganism({genome, body: childBody, x, y, angle, energy, parent});
      this._births++;
      this._record('birth', child.id, child.lineage, {parentId: parent.id});
      return child;
    }

    _die(organism) {
      this._deaths++;
      this._spoiled += organism.energy;
      organism.energy = 0;
      organism.death = this.tick;
      const reason = organism._cause ?? (organism.age >= organism.traits.lifeSpan ? 'senescence' : 'starvation');
      this._pedigree[organism.id].death = this.tick;
      this._pedigree[organism.id].cause = reason;
      this._living.delete(organism.id);
      const lineage = this.lineages[organism.lineage - 1];
      lineage.living--;
      if (lineage.living === 0) lineage.extinct = this.tick;
      this._record('death', organism.id, organism.lineage, {reason});
    }

    step(count = 1) {
      if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Tick count must be a nonnegative integer');
      for (let t = 0; t < count; t++) {
        this.tick++;
        this._renewField();
        this._indexOrganisms();
        const count = this.organisms.length;
        const start = (this.tick - 1) % count;
        // Rotating the first swimmer keeps the fixed iteration order from
        // giving the same individual the first access to food every tick.
        for (let i = 0; i < count; i++) this._act((start + i) % count);
        const children = [];
        let living = 0;
        for (let i = 0; i < count; i++) {
          const organism = this.organisms[i];
          const body = organism.traits;
          if (organism.energy <= 0 || organism.age >= body.lifeSpan) {
            this._die(organism);
            continue;
          }
          this.organisms[living++] = organism;
          if (organism.age >= body.youngAge && this.tick >= organism.nextBirth &&
              organism.energy >= body.maxEnergy * body.reproductionAt) {
            children.push(this._reproduce(organism));
          }
        }
        this.organisms.length = living;
        for (const child of children) this.organisms.push(child);
      }
      return this;
    }

    ancestry(id, limit = 16) {
      const chain = [];
      let record = this._pedigree[id];
      while (record && chain.length < limit) {
        const lineage = this.lineages[record.lineage - 1];
        const genome = this._living.get(record.id)?.genome ?? (lineage.founderId === record.id ? lineage.genome : null);
        chain.push({...record, genome});
        record = this._pedigree[record.parentId];
      }
      return chain;
    }

    summary() {
      const population = this.organisms.length;
      const meanTraits = GENES.map(() => 0);
      const frequencies = new Map();
      let livingMaxGeneration = 0;
      for (const organism of this.organisms) {
        for (let i = 0; i < GENES.length; i++) meanTraits[i] += organism.genome[i];
        frequencies.set(organism.lineage, (frequencies.get(organism.lineage) ?? 0) + 1);
        livingMaxGeneration = Math.max(livingMaxGeneration, organism.generation);
      }
      let diversity = 0;
      for (const count of frequencies.values()) {
        const share = count / population;
        diversity -= share * logShare(share);
      }
      return {
        tick: this.tick, population, initialPopulation: this.initialPopulation, maxGeneration: this._maxGeneration,
        livingMaxGeneration, diversity, meanTraits: meanTraits.map((sum) => population ? sum / population : 0),
        births: this._births, deaths: this._deaths, diet: {...this._diet}, predation: this._predation,
        activeLineages: frequencies.size,
      };
    }

    budget() {
      const jade = this.jade.reduce((total, value) => total + value, 0);
      const amber = this.amber.reduce((total, value) => total + value, 0);
      const biomass = this.organisms.reduce((total, organism) => total + organism.energy, 0);
      return {
        initial: this._initial, regenerated: this._regenerated, burned: this._burned,
        spoiled: this._spoiled, jade, amber, biomass,
        balance: jade + amber + biomass - (this._initial + this._regenerated - this._burned - this._spoiled),
      };
    }
  }

  const api = {World, GENES, traits, ENVIRONMENTS, DEFAULT_SEED};
  if (typeof module === 'object' && module.exports) module.exports = {...api, numerics: {sine, cosine, direction, logShare}};
  else globalThis.Cambrian = api;
})();
