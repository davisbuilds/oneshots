// The restrained interface: a title, arrival cards, one line of hint at a
// time, an interaction prompt, the journal, and the diagnostics panel.
const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class Hud {
  constructor(root, { dragLook = false } = {}) {
    this.root = root;
    this.title = el('div', 'title', `
      <div class="t-mark">THRESHOLD</div>
      <div class="t-sub">an infinity of elsewheres</div>
      <div class="t-actions"><button class="t-go" data-act="enter">Enter</button><button class="t-alt" data-act="demo">Watch the journey</button></div>
      <div class="t-foot">${dragLook ? 'Drag' : 'Mouse'} to look · W A S D to walk · Shift to run · Space to jump · E to touch · Q instrument · J journal · Esc to pause</div>`);
    this.card = el('div', 'card');
    this.hintEl = el('div', 'hint');
    this.promptEl = el('div', 'prompt');
    this.dot = el('div', 'dot');
    this.journalEl = el('div', 'journal');
    this.statsEl = el('pre', 'stats');
    this.pauseEl = el('div', 'pause', '<div class="p-in"><div class="p-t">Paused</div><div class="p-s">Click to return</div><div class="p-row"><button data-act="journal">Journal</button><button data-act="demo">Watch the journey</button><button data-act="reset">Forget everything</button></div></div>');
    if (dragLook) this.pauseEl.querySelector('[data-act="reset"]').remove();
    this.banner = el('div', 'banner');
    for (const e of [this.card, this.hintEl, this.promptEl, this.dot, this.journalEl, this.statsEl, this.pauseEl, this.banner, this.title]) root.appendChild(e);
    this.hints = new Map();
    this.cardTimer = null;
    this.onAction = null;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { e.stopPropagation(); this.onAction?.(b.dataset.act); }
      else if (this.pauseEl.contains(e.target)) this.onAction?.('resume');
    });
  }
  showTitle(v) { this.title.classList.toggle('on', v); }
  showPause(v) { this.pauseEl.classList.toggle('on', v); }
  showDot(v) { this.dot.classList.toggle('on', v); }
  worldCard(name, epithet, coord) {
    this.card.innerHTML = `<div class="c-name">${name}</div><div class="c-epi">${epithet}</div>${coord ? `<div class="c-coord">${coord}</div>` : ''}`;
    this.card.classList.remove('on'); void this.card.offsetWidth; this.card.classList.add('on');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => this.card.classList.remove('on'), 5200);
  }
  note(text, ms = 3200) {
    this.banner.textContent = text;
    this.banner.classList.remove('on'); void this.banner.offsetWidth; this.banner.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.remove('on'), ms);
  }
  hint(id, text) {
    if (this.hintId === id) return;
    this.hintId = id; this.hintEl.textContent = text; this.hintEl.classList.add('on');
  }
  clearHint(id) { if (!id || this.hintId === id) { this.hintId = null; this.hintEl.classList.remove('on'); } }
  prompt(text) {
    if (this.promptText === text) return;
    this.promptText = text;
    this.promptEl.textContent = text || '';
    this.promptEl.classList.toggle('on', !!text);
  }
  stats(text) { this.statsEl.textContent = text || ''; this.statsEl.classList.toggle('on', !!text); }
  journal(open, save) {
    this.journalEl.classList.toggle('on', open);
    if (!open) return;
    const d = save.data, worlds = Object.entries(d.visited).sort((a, b) => a[1].first - b[1].first);
    const lit = Object.keys(d.lit).length;
    const fmt = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    this.journalEl.innerHTML = `<div class="j-in">
      <div class="j-head"><div class="j-t">Journal</div><div class="j-s">${worlds.length} world${worlds.length === 1 ? '' : 's'} visited · ${lit} lodestone${lit === 1 ? '' : 's'} woken</div></div>
      <div class="j-list">${worlds.map(([k, w]) => `
        <div class="j-w">
          ${d.photos[k] ? `<img src="${d.photos[k]}" alt="">` : '<div class="j-ph"></div>'}
          <div class="j-tx"><div class="j-n">${w.name}${d.lit[k] ? ' <span class="j-lit">✦</span>' : ''}</div><div class="j-e">${w.epithet || ''}</div>
          <div class="j-m">${k.includes('/') ? 'a pocket of ' + k.split('/')[0] : 'at ' + k.replace(',', ', ')} · first ${fmt(w.first)} · ${w.n} visit${w.n === 1 ? '' : 's'}</div>
          ${(d.seen[k] || []).length ? `<div class="j-l">${(d.seen[k] || []).map((id) => `<span>${(d.landmarkNames || {})[k + '#' + id] || id}</span>`).join('')}</div>` : ''}
          </div></div>`).join('') || '<div class="j-empty">Nothing yet. Walk through a door.</div>'}</div>
      <div class="j-foot">J or Esc to close</div></div>`;
  }
  fadeTitle() { this.title.classList.add('fading'); setTimeout(() => { this.title.classList.remove('on', 'fading'); }, 1600); }
}
