const roots = { ocean: 73.42, desert: 82.41, forest: 98, ice: 110, archive: 65.41 };
export class Soundscape {
  constructor() {
    this.enabled = false;
    this.id = 'ocean';
    this.tones = [];
  }
  async toggle() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.mix = this.ctx.createGain();
      this.mix.gain.value = 0;
      this.mix.connect(this.ctx.destination);
      for (const [i, ratio] of [1, 1.501, 2.003].entries()) {
        const osc = this.ctx.createOscillator(),
          gain = this.ctx.createGain();
        gain.gain.value = [0.13, 0.065, 0.023][i];
        osc.frequency.value = roots[this.id] * ratio;
        osc.connect(gain).connect(this.mix);
        osc.start();
        this.tones.push([osc, ratio]);
      }
    }
    await this.ctx.resume();
    this.enabled = !this.enabled;
    this.mix.gain.setTargetAtTime(this.enabled ? 0.29 : 0, this.ctx.currentTime, 0.2);
    return this.enabled;
  }
  enter(biome) {
    this.id = biome;
    for (const [osc, r] of this.tones)
      osc.frequency.setTargetAtTime(roots[biome] * r, this.ctx.currentTime, 1.1);
  }
  strike() {
    if (!this.enabled) return;
    for (const ratio of [2, 3.02, 5.01, 7.12]) {
      const osc = this.ctx.createOscillator(),
        gain = this.ctx.createGain(),
        t = this.ctx.currentTime;
      osc.frequency.value = roots[this.id] * ratio;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.18 / Math.sqrt(ratio), t + 0.023);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      osc.connect(gain).connect(this.mix);
      osc.start();
      osc.stop(t + 3.5);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }
}
