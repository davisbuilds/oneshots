'use strict';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
for (const e of $$('[data-icon]')) e.outerHTML = icon(e.dataset.icon);
const FEATURED = 1842,
  storageKey = 'palimpsest.field.v1.';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(storageKey + key));
  } catch {
    return null;
  }
}
function write(key, val) {
  try {
    localStorage.setItem(storageKey + key, JSON.stringify(val));
  } catch {
    $('#save-state').textContent = 'Session memory only';
  }
}
let site,
  state,
  tab = 'site',
  zone = 0,
  labels = true,
  step = 0,
  playTimer = 0,
  orbitTimer = 0,
  digTimer = 0,
  pending = false,
  view;
const markerButtons = $$('.marker'),
  roman = ['IV', 'III', 'II', 'I'],
  letter = (i) => 'ABC'[i];
const zoneNotes = [
  'Survey the columned court and its narrow feeder channel.',
  'Trace the storehouse walls and the household floor beneath.',
  'Follow the buried paving along the old river landing.',
];
const hypotheses = {
  avulsion: 'The river changed course',
  drought: 'Prolonged drought',
  trade: 'A collapse in demand',
};
const departures = { planned: 'A gradual, organized departure', sudden: 'A sudden evacuation' };
function openSite(seed) {
  clearTimeout(digTimer);
  pending = false;
  stopReplay();
  site = simulate(seed);
  const saved = read('site.' + site.seed);
  const surface = site.finds.at(-1).id;
  state = { found: [surface], hypothesis: null, zone: 0 };
  if (saved && Array.isArray(saved.found)) {
    state.found = [...new Set([surface, ...saved.found.filter((id) => site.finds.some((f) => f.id === id))])];
    state.hypothesis = saved.hypothesis || null;
    state.zone = [0, 1, 2].includes(saved.zone) ? saved.zone : 0;
  }
  zone = state.zone;
  step = 0;
  tab = 'site';
  write('seed', site.seed);
  $('#seed-label').textContent = 'SEED ' + String(site.seed).padStart(5, '0');
  view.reset();
  render();
}
function save() {
  state.zone = zone;
  write('site.' + site.seed, state);
}
const findsHere = () =>
  site.finds.filter((f) => f.zone === zone).sort((a, b) => a.depth - b.depth || b.origin - a.origin);
const lastFind = () => site.finds.find((f) => f.id === state.found.at(-1));
const sample = (f) =>
  '<div class="sample"><canvas data-kind="' +
  f.kind +
  '" aria-label="Specimen illustration of ' +
  specimens[f.kind][0] +
  '"></canvas></div>';
function paintSamples(root) {
  for (const c of root.querySelectorAll('canvas[data-kind]')) sampleCanvas(c, c.dataset.kind);
}
function changeZone(n) {
  if (pending || tab !== 'site') return;
  zone = (n + 3) % 3;
  save();
  desk();
  syncMarkers();
}
function syncMarkers() {
  $('#markers').hidden = tab !== 'site' || !labels;
  markerButtons.forEach((e, i) => {
    e.classList.toggle('active', i === zone);
    e.setAttribute('aria-pressed', String(i === zone));
  });
}
function desk() {
  if (tab === 'replay') {
    replayDesk();
    return;
  }
  const here = findsHere(),
    recovered = here.filter((f) => state.found.includes(f.id)),
    next = here.find((f) => !state.found.includes(f.id)),
    latest = lastFind(),
    spec = specimens[latest.kind],
    depth = Math.max(0, ...recovered.map((f) => f.depth));
  $('#desk').innerHTML =
    '<div class="panel"><div class="panel-head"><span class="kicker eyebrow">' +
    icon('dig') +
    'EXCAVATION DESK</span><span class="sector-switch"><button id="prev" aria-label="Previous trench">' +
    icon('left') +
    '</button><button id="next" aria-label="Next trench">' +
    icon('right') +
    '</button></span></div><div class="trench-title"><span class="trench-letter">' +
    letter(zone) +
    '</span><h2>' +
    sectors[zone] +
    '</h2></div><p>' +
    zoneNotes[zone] +
    '</p><div class="readouts"><div><small>Cut depth</small><strong>' +
    (depth / 100).toFixed(2) +
    ' <small style="display:inline">m</small></strong></div><div><small>Recovered</small><strong>' +
    recovered.length +
    ' <span style="color:#868a79">/ ' +
    here.length +
    '</span></strong></div></div><button class="action full" id="excavate">' +
    icon(next ? 'dig' : 'right') +
    (next
      ? 'Excavate trench'
      : state.found.length === site.finds.length
        ? 'Review field journal'
        : 'Move to next trench') +
    '</button></div><div class="panel find-panel"><div class="panel-head"><span class="kicker eyebrow">' +
    icon('box') +
    'LATEST FIND</span><button class="link-button" id="inspect" aria-label="Examine latest find">' +
    icon('arrow') +
    '</button></div><button class="find-record">' +
    sample(latest) +
    '<div><div class="tiny" style="color:var(--gold)">' +
    latest.id +
    '</div><h3>' +
    spec[0] +
    '</h3><small>' +
    spec[1] +
    ' · Trench ' +
    letter(latest.zone) +
    '</small></div></button><div class="research"><small class="small-label">RESEARCH QUESTION</small><p>Why was the terrace abandoned?</p><button id="research-journal" class="link-button">Open field journal ' +
    icon('arrow') +
    '</button></div></div>';
  $('#prev').onclick = () => changeZone(zone - 1);
  $('#next').onclick = () => changeZone(zone + 1);
  $('#research-journal').onclick = () => switchTab('journal');
  $('#inspect').onclick = $('.find-record').onclick = () => showFind(latest);
  $('#excavate').onclick = () => {
    if (next) excavate(next);
    else if (state.found.length === site.finds.length) switchTab('journal');
    else {
      for (let j = 1; j < 3; j++) {
        const n = (zone + j) % 3;
        if (site.finds.some((f) => f.zone === n && !state.found.includes(f.id))) {
          changeZone(n);
          break;
        }
      }
    }
  };
  paintSamples($('#desk'));
}
function excavate(f) {
  if (pending) return;
  pending = true;
  const b = $('#excavate');
  b.disabled = true;
  b.textContent = 'Brushing back the fill…';
  const m = markerButtons[zone],
    stage = $('#stage'),
    r = randomSource(site.seed + f.origin * 9);
  for (let j = 0; j < 28; j++) {
    const e = document.createElement('span');
    e.className = 'dust';
    e.style.left = m.style.left;
    e.style.top = m.style.top;
    e.style.setProperty('--dx', (r() - 0.5) * 96 + 'px');
    e.style.setProperty('--dy', -12 - r() * 56 + 'px');
    e.style.animationDelay = r() * 0.12 + 's';
    stage.append(e);
    setTimeout(() => e.remove(), 1000);
  }
  digTimer = setTimeout(() => {
    pending = false;
    desk();
    recovery(f, () => {
      state.found.push(f.id);
      save();
      view.load(site, state.found);
      desk();
      stratigraphy();
      showFind(f, true);
    });
  }, 630);
}
function modal(html) {
  $('#modal-body').innerHTML = html;
  paintSamples($('#modal-body'));
  if (!$('#dialog').open) $('#dialog').showModal();
}
function showFind(f, newFind = false) {
  const [name, material, desc] = specimens[f.kind],
    event = site.events[f.origin],
    layer = site.deposits[f.layer];
  modal(
    '<div class="eyebrow">' +
      (newFind ? 'FIND RECOVERED' : 'SPECIMEN RECORD') +
      ' / ' +
      f.id +
      '</div><h2>' +
      name +
      '</h2><div class="study-plate">' +
      sample(f) +
      '<button class="study" id="detail-view" aria-pressed="false">×1 · Study surface</button></div><p>' +
      desc +
      '</p><div class="facts">' +
      fact('Trench', letter(f.zone) + ' · ' + sectors[f.zone]) +
      fact('Recovery depth', (f.depth / 100).toFixed(2) + ' m') +
      fact('Context', roman[f.layer] + ' · ' + layer.name) +
      fact('Material', material) +
      '</div><details><summary>Trace historical provenance</summary><p>Event ' +
      String(event.id + 1).padStart(2, '0') +
      ' · Basin year ' +
      event.year +
      '<br>' +
      event.detail +
      '</p><p>Preceding evidence: ' +
      (event.causes.map((i) => site.events[i].title).join(' · ') || 'First settlement') +
      '.</p></details>' +
      (newFind
        ? '<button id="continue" class="action full" style="margin-top:16px">' +
          icon('check') +
          'Recorded · Continue excavation</button>'
        : ''),
  );
  $('#detail-view').onclick = (e) => {
    const b = e.currentTarget,
      detail = b.getAttribute('aria-pressed') === 'false';
    b.setAttribute('aria-pressed', String(detail));
    b.textContent = detail ? '×2.5 · Full object' : '×1 · Study surface';
    sampleCanvas($('.study-plate canvas'), f.kind, detail);
  };
  if (newFind) $('#continue').onclick = () => $('#dialog').close();
}
function fact(k, v) {
  return '<div><small class="small-label">' + k + '</small><p>' + v + '</p></div>';
}
function stratigraphy() {
  $('#strat').innerHTML =
    '<div class="section-head"><h2>' +
    icon('layers') +
    'Stratigraphic sequence</h2><span class="tiny">SHALLOW → DEEP</span></div><div class="strata-row">' +
    site.deposits
      .map((d, i) => ({ d, i }))
      .reverse()
      .map(
        ({ d, i }) =>
          '<button class="stratum" data-layer="' +
          i +
          '"><span class="slice"><canvas></canvas></span><strong><b>' +
          roman[i] +
          '</b>' +
          d.name +
          '</strong><small>' +
          (d.top / 100).toFixed(2) +
          ' – ' +
          (d.bottom / 100).toFixed(2) +
          ' m</small></button>',
      )
      .join('') +
    '</div>';
  $$('.stratum').forEach((b) => {
    const i = +b.dataset.layer,
      d = site.deposits[i];
    drawStrata(b.querySelector('canvas'), i, site.seed);
    b.onclick = () => {
      const f = site.finds.filter((f) => f.layer === i && state.found.includes(f.id));
      modal(
        '<div class="eyebrow">STRATIGRAPHIC CONTEXT ' +
          roman[i] +
          '</div><h2>' +
          d.name +
          '</h2><p>' +
          [
            'The lowest occupation horizon covers the terrace where the first households ground and stored grain.',
            'Compacted floors and paving accumulated during exchange at the landing.',
            site.cause === 'avulsion'
              ? 'Alternating fine bands accumulated as the river slowed near the landing.'
              : 'Evaporite-rich dust accumulated as the basin dried.',
            'Loose, wind-worked earth covers the last occupied surfaces.',
          ][i] +
          '</p><div class="facts">' +
          fact('Upper boundary', d.top + ' cm') +
          fact('Lower boundary', d.bottom + ' cm') +
          '</div><p>Catalogued in this horizon: ' +
          (f.map((v) => specimens[v.kind][0]).join(', ') || 'No finds yet') +
          '.</p>',
      );
    };
  });
}
function render() {
  $$('[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#work').hidden = tab === 'journal';
  $('#journal').hidden = tab !== 'journal';
  if (tab === 'journal') {
    journal();
    return;
  }
  $('#year-plate').hidden = tab !== 'replay';
  $('#strat').hidden = tab === 'replay';
  $('#labels').hidden = tab === 'replay';
  $('#view-label').textContent = tab === 'replay' ? 'HISTORICAL RECONSTRUCTION' : 'SITE DIORAMA';
  view.load(site, state.found, tab === 'replay' ? site.events[step].year : null);
  syncMarkers();
  desk();
  stratigraphy();
}
function switchTab(t) {
  if (pending) return;
  stopReplay();
  tab = t;
  if (t === 'replay') {
    step = 0;
    view.reset();
  }
  render();
}
function journal() {
  const rec = state.found.map((id) => site.finds.find((f) => f.id === id)).reverse(),
    h = state.hypothesis;
  $('#journal').innerHTML =
    '<div class="journal-layout"><section class="journal-panel"><div class="eyebrow">FIELD JOURNAL / CATALOGUE</div><h2>Recovered evidence <span style="color:#929684;font:14px var(--mono)">' +
    rec.length +
    ' / ' +
    site.finds.length +
    '</span></h2><div class="collection">' +
    rec
      .map(
        (f) =>
          '<button class="record-tile" data-id="' +
          f.id +
          '">' +
          sample(f) +
          '<div class="record-info"><span class="small-label">' +
          f.id +
          ' · Trench ' +
          letter(f.zone) +
          '</span><h3>' +
          specimens[f.kind][0] +
          '</h3><small>' +
          f.depth +
          ' cm · ' +
          specimens[f.kind][1] +
          '</small></div></button>',
      )
      .join('') +
    '</div></section><section class="journal-panel"><div class="eyebrow">WORKING HYPOTHESIS</div><h2>Why was Ashara left?</h2><form class="theory-form" id="theory">' +
    choice('cause', 'What put the settlement under pressure?', hypotheses, h?.cause) +
    choice('departure', 'How did the inhabitants leave?', departures, h?.departure) +
    '<label>Cite recovered evidence</label><div class="cite">' +
    rec
      .map(
        (f) =>
          '<label title="' +
          specimens[f.kind][0] +
          '"><input type="checkbox" name="citation" value="' +
          f.id +
          '" ' +
          (h?.cites.includes(f.id) ? 'checked' : '') +
          '>' +
          specimens[f.kind][0] +
          '</label>',
      )
      .join('') +
    '</div><button class="action full">' +
    icon('edit') +
    'Save hypothesis</button></form><p id="theory-note" class="notice" aria-live="polite">' +
    (h ? 'Interpretation recorded.' : '') +
    '</p><button id="compare" class="link-button" style="margin-top:12px">Compare with reconstruction ' +
    icon('arrow') +
    '</button></section></div>';
  paintSamples($('#journal'));
  $$('.record-tile').forEach(
    (b) => (b.onclick = () => showFind(site.finds.find((f) => f.id === b.dataset.id))),
  );
  $('#theory').onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.target),
      cites = data.getAll('citation');
    if (!cites.length) {
      $('#theory-note').textContent = 'Choose a recovered find to support this interpretation.';
      return;
    }
    state.hypothesis = { cause: data.get('cause'), departure: data.get('departure'), cites };
    save();
    $('#theory-note').textContent = 'Interpretation and citations recorded.';
  };
  $('#compare').onclick = () => switchTab('replay');
}
function choice(name, prompt, opts, val) {
  return (
    '<label>' +
    prompt +
    '<select required name="' +
    name +
    '"><option value="">Select an interpretation</option>' +
    Object.entries(opts)
      .map(([k, s]) => '<option value="' + k + '" ' + (k === val ? 'selected' : '') + '>' + s + '</option>')
      .join('') +
    '</select></label>'
  );
}
function stopReplay() {
  clearInterval(playTimer);
  clearInterval(orbitTimer);
  playTimer = orbitTimer = 0;
}
function advance(n) {
  step = Math.min(Math.max(n, 0), site.events.length - 1);
  if (step === site.events.length - 1) stopReplay();
  view.load(site, state.found, site.events[step].year);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
    $('#viewport canvas')?.animate([{ opacity: 0.42 }, { opacity: 1 }], { duration: 520 });
  replayDesk();
}
function replayDesk() {
  const e = site.events[step],
    h = state.hypothesis,
    final = step === site.events.length - 1;
  $('#year-plate').innerHTML = '<small>BASIN YEAR</small><strong>' + e.year + '</strong>';
  let comparison = 'Record an interpretation in the field journal to compare it with the ledger.';
  if (h) {
    const cited = site.finds.filter((f) => h.cites.includes(f.id));
    const supporting = cited.filter((f) =>
      ['avulsion', 'drought', 'depart', 'adapt'].includes(site.events[f.origin].type),
    );
    comparison = final
      ? 'Pressure: ' +
        (site.cause === h.cause ? 'matches' : 'differs') +
        '. Departure: ' +
        (h.departure === 'planned' ? 'matches' : 'differs') +
        '. The ledger records ' +
        hypotheses[site.cause].toLowerCase() +
        ' and a gradual withdrawal. ' +
        (supporting.length
          ? 'Direct evidence in your citations: ' + supporting.map((f) => f.id).join(', ') + '.'
          : 'Your citations document occupation; the pressure horizon and door pin provide direct evidence.')
      : 'Your interpretation: ' +
        hypotheses[h.cause].toLowerCase() +
        ' and ' +
        departures[h.departure].toLowerCase() +
        '. Compare at the final event.';
  }
  $('#desk').innerHTML =
    '<section class="panel"><div class="kicker eyebrow">' +
    icon('film') +
    'RECONSTRUCTION</div><div class="readouts">' +
    fact('Basin year', e.year) +
    fact('Population', e.people) +
    fact('Events', String(step + 1).padStart(2, '0') + ' / ' + site.events.length) +
    '</div><h2 class="replay-title">' +
    e.title +
    '</h2><p class="story">' +
    e.detail +
    '</p><div class="timeline">' +
    site.events
      .map(
        (x, i) =>
          '<button aria-label="Event ' +
          (i + 1) +
          ': ' +
          x.title +
          '" class="' +
          (i <= step ? 'on' : '') +
          '" data-step="' +
          i +
          '"></button>',
      )
      .join('') +
    '</div><div class="replay-actions"><button class="secondary" id="back-event" aria-label="Previous event" ' +
    (step === 0 ? 'disabled' : '') +
    '>' +
    icon('left') +
    '</button><button class="action" id="play">' +
    icon(playTimer ? 'pause' : 'play') +
    (playTimer ? 'Pause' : final ? 'Replay' : 'Play history') +
    '</button><button class="secondary" id="next-event" aria-label="Next event" ' +
    (final ? 'disabled' : '') +
    '>' +
    icon('right') +
    '</button></div></section><section class="panel"><div class="eyebrow">YOUR INTERPRETATION</div><p class="score">' +
    comparison +
    '</p><button id="edit-theory" class="link-button" style="margin-top:12px">Open journal ' +
    icon('arrow') +
    '</button></section>';
  $('#play').onclick = () => {
    if (playTimer) {
      stopReplay();
      replayDesk();
      return;
    }
    if (final) advance(0);
    playTimer = setInterval(() => advance(step + 1), 4200);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      orbitTimer = setInterval(() => view.orbit(0.004), 300);
    replayDesk();
  };
  $('#next-event').onclick = () => advance(step + 1);
  $('#back-event').onclick = () => advance(step - 1);
  $$('[data-step]').forEach((b) => (b.onclick = () => advance(+b.dataset.step)));
  $('#edit-theory').onclick = () => switchTab('journal');
}
$('#seed').onclick = () => {
  if (pending) return;
  modal(
    '<div class="eyebrow">FIELD ATLAS</div><h2>Open an expedition</h2><p style="margin-bottom:18px">Each seed follows a different river history. Your field record is kept separately for each site.</p><form id="seed-form"><label for="seed-input">Simulation seed</label><input id="seed-input" type="number" min="0" max="4294967295" step="1" required value="' +
      site.seed +
      '"><button class="action">Open site</button></form><button id="featured" class="link-button" style="margin-top:16px">Return to featured Tell Ashara ' +
      icon('arrow') +
      '</button>',
  );
  $('#seed-form').onsubmit = (e) => {
    e.preventDefault();
    openSite(+$('#seed-input').value);
    $('#dialog').close();
  };
  $('#featured').onclick = () => {
    openSite(FEATURED);
    $('#dialog').close();
  };
};
$('#help').onclick = () =>
  modal(
    '<div class="eyebrow">SURVEY MANUAL</div><h2>A field guide to Ashara</h2><p>One water jar was collected during the surface survey. Why did its owners leave?</p><p>Select A, B, or C on the site and excavate. Each cut reaches the next surviving object in burial order. Examine the object and its layer in your field journal.</p><p>Build a hypothesis, cite your finds, then play Reconstruction to compare your reading against the settlement’s actual history.</p><p>Drag to orbit or focus the model and use the left and right arrow keys. The + and − controls change magnification.</p>',
  );
$('#close').onclick = () => $('#dialog').close();
$('#dialog').onclick = (e) => {
  if (e.target === $('#dialog')) {
    const b = e.target.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      e.target.close();
  }
};
$$('[data-tab]').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
markerButtons.forEach((b, i) => (b.onclick = () => changeZone(i)));
$('#labels').onclick = () => {
  labels = !labels;
  $('#labels').setAttribute('aria-pressed', String(labels));
  syncMarkers();
};
$('#plus').onclick = () => view.magnify(0.13);
$('#minus').onclick = () => view.magnify(-0.13);
$('#reset').onclick = () => view.reset();
contourMap($('#contours'));
try {
  view = makeView($('#viewport'), markerButtons, changeZone);
} catch {
  $('#viewport').innerHTML =
    '<p style="padding:80px 24px;color:var(--ink)">The 3D view requires WebGL. Select trenches with the desk arrows to continue excavation.</p>';
  view = { reset() {}, load() {}, magnify() {}, orbit() {} };
  markerButtons.forEach((b) => (b.style.visibility = 'hidden'));
}
const lastSeed = read('seed');
openSite(Number.isInteger(lastSeed) ? lastSeed : FEATURED);
