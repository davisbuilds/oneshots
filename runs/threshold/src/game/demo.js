// Cinematic demo (filled in later in the run).
export class Demo {
  constructor(app) { this.app = app; this.active = false; }
  start() { this.active = false; }
  control() { return { forward: 0, right: 0, run: false, jump: false }; }
}
