// app.js: the shell around the puzzles. Map, play screen, lesson cards,
// hints, the algorithm demo, the notebook, and saved progress.
(() => {
  const { h, patch, fmt, esc } = BB;
  const $ = (q, el = document) => el.querySelector(q);
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  BB.still = TEST;

  // ── Saved progress ─────────────────────────────────────────────────────
  const KEY = 'bit-by-bit/v1';
  const blank = () => ({ stars: {}, best: {}, seen: {}, opts: { sound: true, theme: 'auto', unlock: false } });
  let save = blank();
  try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.stars) save = Object.assign(blank(), raw, { opts: Object.assign(blank().opts, raw.opts) }); } catch (e) { /* private mode: play without saving */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
  const applyOpts = () => {
    BB.sfx.on = save.opts.sound && !TEST;
    if (save.opts.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', save.opts.theme);
  };

  const main = BB.levels.filter((l) => !l.bonus);
  const unlocked = (lv) => {
    if (save.opts.unlock || TEST) return true;
    const before = BB.levels.slice(0, lv.index).filter((l) => !l.bonus).pop();
    return !before || save.stars[before.id] > 0;
  };
  const nextUp = () => main.find((l) => !save.stars[l.id]) || null;
  const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);

  // ── Small pieces of markup ─────────────────────────────────────────────
  const ICON = {
    back: '<path d="M14 5l-7 7 7 7"/>', undo: '<path d="M8 5L4 9l4 4"/><path d="M4 9h9a6 6 0 010 12H9"/>', redo: '<path d="M4 12a8 8 0 108-8H7"/><path d="M10 1L7 4l3 3"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.500A6 6 0 0012 3z"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M18.5 6.500a8 8 0 010 11"/>', mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M7 4v16M17 4v16"/>', step: '<path d="M5 4l10 8-10 8z"/><path d="M19 4v16"/>', x: '<path d="M5 5l14 14M19 5L5 19"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
  };
  const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
  const star = (on) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.500l2.9 6.2 6.6.800-4.9 4.6 1.3 6.600L12 17.400l-5.9 3.3 1.3-6.600L2.5 9.500l6.6-.800z"/></svg>`;
  const stars = (n) => `<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => star(i < n)).join('')}</span>`;
  const face = (who, mood) => `<svg class="who ${who} ${mood || ''}" viewBox="0 0 64 64" aria-hidden="true"><use href="#${who}"/></svg>`;
  const worldOf = (lv) => BB.worlds.find((w) => w.n === lv.world);
  const label = (lv) => (lv.bonus ? `${lv.world}-★` : lv.id);

  // ── Screens ────────────────────────────────────────────────────────────
  const show = (name) => { for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== name; closeModal(); window.scrollTo(0, 0); };

  const renderMap = () => {
    const up = nextUp(), got = totalStars(), max = BB.levels.length * 3;
    const done = main.filter((l) => save.stars[l.id]).length;
    $('#map').innerHTML = `
      <header class="hero">
        <div class="logo" aria-label="Bit by Bit">${'BIT BY BIT'.split('').map((c, i) => (c === ' ' ? '<i></i>' : `<b style="--i:${i}">${c}</b>`)).join('')}</div>
        <p class="tag">You are the algorithm.</p>
        <div class="cast">${face('bit')}<p>Thirty-four small puzzles about data structures and algorithms, from the first array to dynamic programming. Play each idea with your own hands first; find out what it is called afterwards.</p>${face('murphy')}</div>
        <div class="row">
          <button class="btn primary" data-go="${up ? up.id : main[0].id}">${icon('play')}<span>${done === 0 ? 'Start' : up ? `Continue: ${esc(up.title)}` : 'Play again from the start'}</span></button>
          <button class="btn" data-book>${icon('book')}<span>Notebook</span></button>
          <button class="btn" data-settings aria-label="Settings">${icon('gear')}</button>
        </div>
        <div class="progress" role="img" aria-label="${done} of ${main.length} levels, ${got} of ${max} stars"><div class="bar"><i style="width:${(100 * done / main.length).toFixed(1)}%"></i></div><span>${done} / ${main.length} levels</span><span>${star(true)} ${got} / ${max}</span></div>
      </header>
      <div class="worlds">${BB.worlds.map((w) => {
        const lvls = BB.levels.filter((l) => l.world === w.n);
        return `<section class="world c-${w.color}"><div class="wtab"><b>${w.n}</b></div><div class="wbody"><h2>${esc(w.name)}</h2><p>${esc(w.sub)}</p>
          <div class="chips">${lvls.map((l) => {
            const open = unlocked(l), st = save.stars[l.id] || 0;
            return `<button class="chip${open ? '' : ' locked'}${st ? ' done' : ''}${up && up.id === l.id ? ' next' : ''}${l.bonus ? ' bonus' : ''}" ${open ? `data-go="${l.id}"` : 'disabled'} aria-label="${label(l)} ${esc(l.title)}${open ? `, ${st} of 3 stars` : ', locked'}"><span class="num">${open ? label(l) : icon('lock')}</span><span class="nm">${esc(l.title)}</span>${stars(st)}</button>`;
          }).join('')}</div></div></section>`;
      }).join('')}</div>
      <footer class="foot">Progress is kept in this browser only. Nothing is sent anywhere.</footer>`;
  };

  const renderBook = () => {
    const known = BB.levels.filter((l) => save.stars[l.id]);
    $('#book').innerHTML = `
      <header class="bookhead"><button class="btn" data-home>${icon('back')}<span>Map</span></button><h1>Notebook</h1><span class="count">${known.length} / ${BB.levels.length} ideas</span></header>
      <section class="ladder"><h2>The ladder</h2><p>How the work grows as the input grows. The last column is a million items at a million steps per second.</p>
        <div class="rungs">${BB.ladder.map((r, i) => `<div class="rung" style="--i:${i}"><b>${r.big}</b><span>${r.name}</span><em>${esc(r.eg)}</em><strong>${esc(r.cost)}</strong></div>`).join('')}</div></section>
      ${BB.worlds.map((w) => `<section class="bworld c-${w.color}"><h2><b>${w.n}</b> ${esc(w.name)} <small>${esc(w.sub)}</small></h2><div class="cards">${BB.levels.filter((l) => l.world === w.n).map((l) => (save.stars[l.id]
        ? `<details class="card"><summary><span class="nm">${esc(l.win.name)}</span><span class="big">${esc(l.win.big)}</span></summary><p>${fmt(l.win.insight)}</p>${BB.code(l.win.code)}<button class="btn small" data-go="${l.id}">${icon('play')}<span>Play ${label(l)} again</span></button></details>`
        : `<div class="card unknown"><span class="nm">? ? ?</span><span class="big">${label(l)}</span></div>`)).join('')}</div></section>`).join('')}`;
  };

  // ── Modal cards ────────────────────────────────────────────────────────
  let modalKeep = false;
  const openModal = (html, cls, keep) => { const m = $('#modal'); m.innerHTML = `<div class="card ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; modalKeep = !!keep; const b = m.querySelector('.primary') || m.querySelector('button'); if (b) b.focus(); };
  const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };

  const settings = () => openModal(`
    <h2>Settings</h2>
    <label class="opt"><input type="checkbox" data-opt="sound" ${save.opts.sound ? 'checked' : ''}><span>Sound</span></label>
    <label class="opt"><span>Appearance</span><select data-opt="theme">${['auto', 'light', 'dark'].map((t) => `<option value="${t}" ${save.opts.theme === t ? 'selected' : ''}>${t === 'auto' ? 'Match my device' : t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
    <label class="opt"><input type="checkbox" data-opt="unlock" ${save.opts.unlock ? 'checked' : ''}><span>Unlock every level</span></label>
    <div class="row"><button class="btn danger" data-reset>Erase my progress</button><button class="btn primary" data-close>Done</button></div>`, 'settings');

  // ── The play screen ────────────────────────────────────────────────────
  const G = BB.game = { lv: null, s: null, hist: [], ui: {}, hints: 0, hint: null, demo: null, say: null, seed: 0, busy: false };
  const P = () => BB.logic[G.s.type];
  const unitOf = () => { const u = P().unit; return typeof u === 'function' ? u(G.s) : u || 'moves'; };
  const canUndo = () => { const u = P().undo; return typeof u === 'function' ? u(G.s) : !!u; };

  const stageSize = () => {
    const box = $('#stagewrap').getBoundingClientRect();
    const a = (box.width || 960) / (box.height || 540);
    return a >= 1 ? { W: Math.round(Math.max(720, Math.min(1120, 540 * a))), H: 540 } : { W: 540, H: Math.round(Math.max(600, Math.min(900, 540 / a))) };
  };

  const render = () => {
    if (!G.s) return;
    const s = G.s, lv = G.lv, { W, H } = stageSize();
    const svg = $('#stage');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const c = {
      W, H, portrait: H > W, ui: G.ui, demo: !!G.demo, lv, redraw: render, hint: G.hint,
      act: (a) => { if (G.probing) G.probing.push(a); else if (!G.demo) dispatch(a); },
      hot: (pred) => !!(G.hint && pred(G.hint)),
      pt: (e) => { const m = svg.getScreenCTM().inverse(); return { x: e.clientX * m.a + e.clientY * m.c + m.e, y: e.clientX * m.b + e.clientY * m.d + m.f }; },
    };
    patch(svg, BB.views[s.type](s, c));
    // Heads-up display
    const w = worldOf(lv);
    $('#play').className = 'screen c-' + w.color + (G.demo ? ' demo' : '');
    $('#lvname').innerHTML = `<small>${label(lv)} · ${esc(w.sub)}</small><b>${esc(G.demo ? 'Watching: ' + lv.win.name : lv.title)}</b>`;
    const cap = s.limit != null ? s.limit : s.par;
    const over = s.par != null && s.ops > s.par;
    $('#meter').innerHTML =
      (s.rounds > 1 ? `<span class="pill" title="Rounds">${BB.range(s.rounds, (i) => `<i class="${i < s.round ? 'on' : i === s.round ? 'cur' : ''}"></i>`).join('')}</span>` : '') +
      `<span class="pill count${over ? ' over' : ''}"><b>${s.ops}</b>${cap != null ? `<span>/ ${cap}</span>` : ''} <em>${unitOf()}</em></span>` +
      (s.par != null && s.limit != null && s.limit !== s.par ? `<span class="pill par" title="Three stars">${star(true)} ${s.par}</span>` : '') +
      `<span class="pill lives" aria-label="${s.maxStrikes - s.strikes} mistakes left">${BB.range(s.maxStrikes, (i) => `<i class="${i < s.maxStrikes - s.strikes ? 'on' : ''}"></i>`).join('')}</span>`;
    $('#task').textContent = s.prompt;
    const say = G.say || { who: 'bit', text: '' };
    $('#talk').className = 'talk ' + say.who + (say.text ? '' : ' quiet');
    $('#talkface').innerHTML = face(say.who);
    if ($('#say').textContent !== say.text) { $('#say').textContent = say.text; if (!TEST && say.text) { $('#talk').classList.remove('pop'); void $('#talk').offsetWidth; $('#talk').classList.add('pop'); } }
    $('#undo').disabled = !!G.demo || !canUndo() || !G.hist.length || s.status !== 'play';
    $('#undo').hidden = !canUndo();
    $('#hint').disabled = !!G.demo || s.status !== 'play';
    $('#again').disabled = !!G.demo;
    $('#sound').innerHTML = icon(save.opts.sound ? 'sound' : 'mute');
    $('#codepane').hidden = !G.demo;
    if (G.demo) {
      $('#codepane').innerHTML = `<h3>${esc(lv.win.name)} <span>${esc(lv.win.big)}</span></h3>${BB.code(lv.win.code, G.demo.line)}`;
      const hotLine = $('#codepane .hot'); if (hotLine && hotLine.scrollIntoView) hotLine.scrollIntoView({ block: 'nearest' });
      $('#demobar').innerHTML = `<button class="btn small" data-demo="toggle">${icon(G.demo.paused ? 'play' : 'pause')}<span>${G.demo.paused ? 'Play' : 'Pause'}</span></button><button class="btn small" data-demo="step">${icon('step')}<span>Step</span></button><button class="btn small" data-demo="speed"><span>${G.demo.fast ? 'Fast' : 'Normal'} speed</span></button><button class="btn small primary" data-demo="exit"><span>My turn</span></button>`;
    }
    $('#demobar').hidden = !G.demo;
  };

  const begin = (seed, keepSay) => {
    const lv = G.lv;
    G.seed = seed == null ? lv.seed : seed;
    G.s = BB.init(lv.type, lv.cfg, G.seed);
    G.hist = []; G.ui = {}; G.hints = 0; G.hint = null; G.busy = false;
    if (!keepSay) G.say = null;
    clearTimeout(G.timer);
    render();
  };

  const dispatch = (a) => {
    const s = G.s;
    if (!s || G.busy || s.status !== 'play') return { ok: false, ev: [] };
    const snap = canUndo() ? JSON.stringify(s) : null;
    const r = BB.act(s, a);
    if (r.ok && snap) G.hist.push(snap);
    G.hint = null; G.ui.sel = null;
    for (const ev of r.ev) BB.sfx.play(ev);
    if (r.say) G.say = r.say; else if (r.ok && !G.demo) G.say = null;
    if (!r.ok && r.ev.some((e) => e.t === 'strike') && !TEST) { const st = $('#stagewrap'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); }
    render();
    if (s.status !== 'play' && !G.demo) finish();
    return r;
  };

  const undo = (penalty) => {
    if (!G.hist.length) return;
    const strikes = G.s.strikes + (penalty ? 1 : 0);
    G.s = JSON.parse(G.hist.pop()); G.s.strikes = Math.min(strikes, G.s.maxStrikes - 1);
    G.hint = null; G.ui = {}; G.busy = false;
    G.say = { who: 'bit', text: 'One step back.' };
    BB.sfx.play({ t: 'ui' });
    render();
  };

  const giveHint = () => {
    const hnt = P().hint(G.s);
    if (!hnt) return;
    G.hints++;
    if (hnt.undo) { G.say = { who: 'bit', text: hnt.note }; G.hint = null; if (G.hist.length) { $('#undo').classList.add('pulse'); setTimeout(() => $('#undo').classList.remove('pulse'), 1500); } render(); return; }
    G.hint = hnt.a; G.say = { who: 'bit', text: hnt.note };
    BB.sfx.play({ t: 'ui' });
    render();
  };

  const PRAISE = ['Nicely done.', 'Solved.', 'That is the one.', 'Clean.', 'Exactly right.'];
  const finish = () => {
    const s = G.s, lv = G.lv;
    G.busy = true;
    const won = s.status === 'won';
    G.timer = setTimeout(() => {
      BB.sfx.play({ t: won ? 'win' : 'lose' });
      if (won) {
        const n = BB.stars(s, G.hints), first = !save.stars[lv.id];
        save.stars[lv.id] = Math.max(save.stars[lv.id] || 0, n);
        if (save.best[lv.id] == null || s.ops < save.best[lv.id]) save.best[lv.id] = s.ops;
        persist();
        const nxt = BB.levels[lv.index + 1], allDone = main.every((l) => save.stars[l.id]);
        const why = n === 3 ? '' : G.hints && BB.stars(s, 0) > n ? 'Three stars are for solving it without a hint.' : s.strikes ? `Three stars are for a clean run: ${s.strikes} ${s.strikes === 1 ? 'mistake' : 'mistakes'} this time.` : `Three stars at ${s.par} ${unitOf()} or fewer. You used ${s.ops}.`;
        openModal(`
          <div class="band"><div class="bigstars">${[0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}" style="--i:${i}">${star(i < n)}</span>`).join('')}</div><h2>${PRAISE[(lv.index + n) % PRAISE.length]}</h2>${why ? `<p class="why">${why}</p>` : ''}</div>
          <div class="learn"><p class="eyebrow">What you just did has a name</p><h3>${esc(lv.win.name)} <span class="bigo">${esc(lv.win.big)}</span></h3><p>${fmt(lv.win.insight)}</p>${BB.code(lv.win.code)}</div>
          <div class="row">
            <button class="btn" data-demo="start">${icon('play')}<span>Watch it run</span></button>
            <button class="btn" data-again>${icon('redo')}<span>Again</span></button>
            ${lv.fixed ? '' : `<button class="btn" data-fresh>${icon('dice')}<span>New puzzle</span></button>`}
            ${first && allDone ? '<button class="btn primary" data-grad><span>Finish</span></button>' : nxt ? `<button class="btn primary" data-go="${nxt.id}"><span>Next: ${esc(nxt.title)}</span></button>` : '<button class="btn primary" data-home><span>Back to the map</span></button>'}
          </div>`, 'win c-' + worldOf(lv).color, true);
        if (!TEST) for (let i = 0; i < n; i++) setTimeout(() => BB.sfx.play({ t: 'star', v: i / 2 }), 350 + i * 220);
      } else {
        const why = s.why === 'strikes' ? `${s.maxStrikes} mistakes, and Murphy only allows ${s.maxStrikes - 1}.` : s.why === 'budget' ? `Out of ${unitOf()}: you had ${s.limit}.` : s.why;
        openModal(`
          <div class="band lost">${face('murphy', 'smug')}<h2>${['Murphy wins this one.', 'Not this time.', 'So close. (Murphy says.)'][lv.index % 3]}</h2></div>
          <div class="learn"><p>${esc(why)}</p>${lv.tip ? `<p class="tip">${face('bit')}<span>${fmt(lv.tip)}</span></p>` : ''}</div>
          <div class="row">${canUndo() && G.hist.length && s.why !== 'strikes' && s.why !== 'budget' ? `<button class="btn" data-undolast>${icon('undo')}<span>Take that back</span></button>` : ''}<button class="btn" data-demo="start">${icon('play')}<span>Show me how</span></button><button class="btn primary" data-again>${icon('redo')}<span>Try again</span></button></div>`, 'fail', true);
      }
    }, TEST ? 0 : won ? 750 : 600);
  };

  const intro = (lv) => {
    const w = worldOf(lv);
    openModal(`
      <div class="band"><p class="eyebrow">World ${w.n} · ${esc(w.name)}</p><h2>${lv.bonus ? '★ ' : ''}${esc(lv.title)}</h2></div>
      <div class="learn">${lv.intro.map((p, i) => `<p class="${i === 0 ? 'lead' : ''}">${fmt(p)}</p>`).join('')}<p class="goal"><b>Goal</b>${esc(lv.goal)}</p></div>
      <div class="row"><button class="btn" data-home>${icon('back')}<span>Map</span></button><button class="btn primary" data-close>${icon('play')}<span>Play</span></button></div>`, 'intro c-' + w.color, true);
  };

  const openLevel = (id, o = {}) => {
    const lv = BB.level(id);
    if (!lv || !unlocked(lv)) { go(''); return; }
    stopDemo(true);
    clearTimeout(G.timer);
    G.lv = lv;
    show('play');
    begin(o.seed);
    G.say = { who: 'bit', text: lv.goal };
    render();
    if (!o.quiet) intro(lv);
  };

  // ── Watching the algorithm ─────────────────────────────────────────────
  const demoTick = () => {
    const d = G.demo;
    if (!d) return;
    const s = G.s, wait = (ms) => (TEST ? 0 : d.fast ? ms * 0.4 : ms);
    if (s.status !== 'play') {
      G.hint = null; d.line = null; d.done = true; d.paused = true;
      G.say = { who: 'bit', text: `That is ${G.lv.win.name.toLowerCase()}, start to finish, in ${s.ops} ${unitOf()}. Your turn.` };
      render(); return;
    }
    if (d.phase === 'show') {
      const hnt = P().hint(s);
      if (!hnt || !hnt.a) { stopDemo(); return; }
      d.next = hnt.a; d.line = hnt.line || null; G.hint = hnt.a; G.say = { who: 'bit', text: hnt.note };
      d.phase = 'do'; render();
      if (!d.paused) d.timer = setTimeout(demoTick, wait(Math.min(2600, 900 + hnt.note.length * 22)));
    } else {
      const r = BB.act(s, d.next);
      for (const ev of r.ev) BB.sfx.play(ev);
      G.hint = null; d.phase = 'show'; render();
      if (!d.paused || s.status !== 'play') d.timer = setTimeout(demoTick, wait(480));
    }
  };
  const startDemo = () => {
    closeModal(); stopDemo(true);
    begin(G.seed);
    G.demo = { phase: 'show', paused: false, fast: false, line: null };
    demoTick();
  };
  function stopDemo(silent) {
    if (!G.demo) return;
    clearTimeout(G.demo.timer); G.demo = null; G.hint = null;
    if (!silent) { begin(G.seed); G.say = { who: 'bit', text: G.lv.goal }; render(); }
  }

  const graduate = () => openModal(`
    <div class="band grad"><div class="cast">${face('bit')}${face('murphy')}</div><h2>You are the algorithm.</h2></div>
    <div class="learn"><p class="lead">Nine worlds, ${main.length} levels, ${totalStars()} stars.</p>
      <p>You searched by halving, sorted five different ways, built stacks, queues, lists, hash tables, trees and heaps with your own hands, crossed graphs four ways, and replaced an exponential with a table.</p>
      <p>The names and the code for all of it are in your Notebook. The best next step is to type them out in a real language and watch them run.</p>
      <p class="tip">${face('murphy')}<span>I will be in your next program, waiting. Plan for me.</span></p></div>
    <div class="row"><button class="btn" data-book>${icon('book')}<span>Notebook</span></button><button class="btn primary" data-home><span>Back to the map</span></button></div>`, 'win');

  // ── Wiring ─────────────────────────────────────────────────────────────
  const route = (to) => {
    const hsh = (typeof to === 'string' ? to : location.hash).replace(/^#\/?/, '');
    if (hsh.startsWith('play-')) { const id = hsh.slice(5); if (!G.lv || G.lv.id !== id || $('#play').hidden) openLevel(id); return; }
    stopDemo(true); clearTimeout(G.timer);
    G.lv = null; G.s = null;
    if (hsh === 'book') { renderBook(); show('book'); } else { renderMap(); show('map'); }
  };
  const go = (hsh) => { try { if (location.hash !== hsh && (hsh || location.hash)) location.hash = hsh; } catch (e) { /* a frame may refuse; the page still navigates */ } route(hsh); };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-go]');
    if (!t) { if (e.target.id === 'modal' && !modalKeep) closeModal(); return; }
    const d = t.dataset;
    if (t.disabled) return;
    if (t.closest('#app') && !t.closest('#stage')) BB.sfx.play({ t: 'ui' });
    if (d.go) { const same = G.lv && G.lv.id === d.go && !$('#play').hidden; if (same) openLevel(d.go); else go('#play-' + d.go); }
    else if ('home' in d) go('');
    else if ('book' in d) go('#book');
    else if ('settings' in d) settings();
    else if ('close' in d) { closeModal(); if ($('#map').hidden === false) renderMap(); }
    else if ('reset' in d) { if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Really erase? Tap again'; } else { const opts = save.opts; save = blank(); save.opts = opts; save.opts.unlock = false; persist(); closeModal(); renderMap(); } }
    else if ('again' in d) { closeModal(); stopDemo(true); begin(G.seed); G.say = { who: 'bit', text: G.lv.goal }; render(); }
    else if ('fresh' in d) { closeModal(); stopDemo(true); begin(1 + Math.floor(Math.random() * 1e6)); G.say = { who: 'bit', text: 'A fresh one. ' + G.lv.goal }; render(); }
    else if ('undolast' in d) { closeModal(); clearTimeout(G.timer); undo(true); }
    else if ('grad' in d) graduate();
    else if (d.demo === 'start') startDemo();
    else if (d.demo === 'exit') stopDemo();
    else if (d.demo === 'toggle') { const dm = G.demo; if (dm.done) { startDemo(); return; } dm.paused = !dm.paused; clearTimeout(dm.timer); render(); if (!dm.paused) demoTick(); }
    else if (d.demo === 'step') { const dm = G.demo; if (dm.done) return; dm.paused = true; clearTimeout(dm.timer); demoTick(); if (G.demo && G.demo.phase === 'show' && G.s.status === 'play') demoTick(); }
    else if (d.demo === 'speed') { G.demo.fast = !G.demo.fast; render(); }
    else if (t.id === 'undo') undo();
    else if (t.id === 'hint') giveHint();
    else if (t.id === 'sound') { save.opts.sound = !save.opts.sound; persist(); applyOpts(); render(); }
    else if (t.id === 'info') intro(G.lv);
  });
  document.addEventListener('change', (e) => {
    const k = e.target.dataset.opt;
    if (!k) return;
    save.opts[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    persist(); applyOpts();
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el.closest && el.closest('#stage') && el.onclick) { e.preventDefault(); el.onclick(e); return; }
    if (e.key === 'Escape' && !$('#modal').hidden && !modalKeep) closeModal();
    if (!$('#play').hidden && $('#modal').hidden && !G.demo && !e.metaKey && !e.ctrlKey && el.tagName !== 'INPUT') {
      if (e.key === 'z' || e.key === 'u') undo();
      else if (e.key === 'h' || e.key === '?') giveHint();
      else if (e.key === 'r') { begin(G.seed); G.say = { who: 'bit', text: G.lv.goal }; render(); }
    }
  });
  window.addEventListener('hashchange', () => route());
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(render); });

  // For the verifier: which stage elements, clicked in order, perform this
  // action? Found by calling the views' own handlers with dispatch diverted,
  // so the verifier can then make the same clicks with a real mouse.
  const probe = (want) => {
    const svg = $('#stage'), norm = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    const taps = () => [...svg.querySelectorAll('[role="button"]')].filter((el) => el.onclick && !el._gone);
    const ui0 = JSON.stringify(G.ui), key = norm(want);
    const reset = (json) => { for (const k of Object.keys(G.ui)) delete G.ui[k]; Object.assign(G.ui, JSON.parse(json)); render(); };
    const hit = (el) => { G.probing = []; el.onclick({}); const got = G.probing.some((a) => norm(a) === key); G.probing = null; return got; };
    let found = null;
    for (const el of taps()) { if (hit(el)) { found = [el]; break; } reset(ui0); }
    if (!found) for (const first of taps()) {
      reset(ui0); G.probing = []; first.onclick({}); G.probing = null;
      const ui1 = JSON.stringify(G.ui);
      if (ui1 === ui0) continue;
      for (const el of taps()) { if (hit(el)) { found = [first, el]; break; } reset(ui1); }
      if (found) break;
    }
    reset(ui0);
    for (const el of svg.querySelectorAll('[data-probe]')) el.removeAttribute('data-probe');
    if (found) found.forEach((el, i) => el.setAttribute('data-probe', i + 1));
    return found ? found.length : 0;
  };

  BB.app = {
    // Used by the browser verifier: everything goes through the same paths as a click.
    api: { open: (id, o) => { location.hash = '#play-' + id; openLevel(id, o); }, act: (a) => dispatch(a), hint: () => P().hint(G.s), state: () => G.s, undo, startDemo, stopDemo, save: () => save, render, closeModal, giveHint, route, probe },
  };
  applyOpts();
  if (TEST) document.documentElement.classList.add('still');
  route();
})();
