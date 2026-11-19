// GPU time is optional. Reading only ready queries keeps the diagnostic from
// serializing the normal render loop. A disjoint invalidates outstanding work.
export class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.last = null;
    this.active = null;
  }
  begin(sample) {
    if (!this.ext) return;
    const gl = this.gl,
      ext = this.ext;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending = [];
      this.last = null;
    }
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift();
      this.last = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
    }
    if (sample && this.pending.length < 3) {
      this.active = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, this.active);
    }
  }
  end() {
    if (this.active) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
  }
}
