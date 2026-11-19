'use strict';
(function (root) {
  const engineSha256 = 'e92fc85dec116294b220fe9bf2e65b941f58996f20df557e3cc5a8093eaf28e8';
  class Culture {
    constructor(options, engine) {
      this.options = {
        seed: options.seed,
        environment: options.environment,
        mutation: options.mutation,
      };
      this.engine = engine;
      this.world = new engine.World(this.options);
      this.actions = [];
      this.control = null;
      this.contacts = [];
      this.events = [{ tick: 0, type: 'founding', organismId: null, lineage: null }];
      this.interval = 16;
      this.samples = [{ ...this.world.summary(), tick: 0 }];
    }
    collect(after) {
      for (const event of this.world.events) {
        if (event.tick <= after) continue;
        this.events.push(event);
        if (event.type === 'predation') this.contacts.push(event);
      }
      // The seed and action record can reconstruct events beyond the live notebook.
      if (this.contacts.length > 24) this.contacts.splice(0, this.contacts.length - 24);
      if (this.events.length > 384) this.events.splice(1, this.events.length - 384);
    }
    advance(count) {
      let left = count;
      while (left > 0) {
        const start = this.world.tick;
        const n = Math.min(left, this.interval - (start % this.interval), 32);
        this.world.step(n);
        this.control?.step(n);
        this.collect(start);
        left -= n;
        if (this.world.tick % this.interval === 0) {
          this.samples.push(this.world.summary());
          if (this.samples.length > 2048) {
            this.interval *= 2;
            this.samples = this.samples.filter((s) => s.tick % this.interval === 0);
          }
        }
      }
    }
    expose(action) {
      if (action === this.world.environment) return;
      this.world.action(action);
      this.actions.push({ tick: this.world.tick, action });
      const event = this.world.events.at(-1);
      if (event?.type === 'environment') this.events.push(event);
    }
    export() {
      return {
        schema: 1,
        engineSha256,
        ...this.options,
        ticks: this.world.tick,
        sampleEvery: this.interval,
        actions: this.actions.map((a) => ({ ...a })),
      };
    }
    async reconstruct(tick, active = () => true) {
      tick = Math.min(this.world.tick, Math.max(0, Math.floor(tick)));
      const world = new this.engine.World(this.options);
      let next = 0;
      let slice = performance.now();
      while (active()) {
        while (this.actions[next]?.tick === world.tick) world.action(this.actions[next++].action);
        if (world.tick === tick) return world;
        world.step(Math.min(48, tick - world.tick, (this.actions[next]?.tick ?? Infinity) - world.tick));
        if (performance.now() - slice > 17) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          slice = performance.now();
        }
      }
      return null;
    }
    async pair(active = () => true) {
      if (this.control) return true;
      const copy = await this.reconstruct(this.world.tick, active);
      if (!copy || !active()) return false;
      this.control = copy;
      this.pairedAt = copy.tick;
      this.controlActions = this.actions.map((a) => ({ ...a }));
      return true;
    }
  }
  const api = { Culture };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecordBook = api;
})(globalThis);
