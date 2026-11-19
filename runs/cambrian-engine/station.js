'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const pad = (n, d = 4) => String(n).padStart(d, '0');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(n, lo));
  const wrap = (x, n) => ((x % n) + n) % n;
  const short = (x, n) => x - Math.round(x / n) * n;
  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const paths = {
    aperture: ['M16.8 7a7.4 7.4 0 1 1-2-2.8', 'M7 3l3 6 7-1M17 13l-7-4-4 6M5 5l-1 7 6-3M9 17l1-8'],
    branch: ['M5 3v14M5 10c5 0 7-1 8-5M5 14c3 0 6 1 9 3', 'M12 3h3v3M13 16h3v3'],
    pulse: ['M1 12h4l3-7 4 11 3-8 2 4h3'],
    book: ['M10 5Q5 2 2 4v12q4-2 8 0 4-2 8 0V4q-4-2-8 1v11'],
    download: ['M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4'],
    sliders: ['M3 6h6m4 0h4M3 14h2m4 0h8', 'M9 4h3v4H9zM5 12h3v4H5z'],
    wave: ['M1 7q2-3 5 0t5 0 5 0l3-1M1 13q2-3 5 0t5 0 5 0l3-1'],
    cinema: ['M2.5 5.5h10v9h-10zM13 8l4.5-2v8L13 12z'],
    pause: ['M7 4v12M13 4v12'],
    play: ['M6 3.5 16 10 6 16.5Z'],
    step: ['M4 5l8 5-8 5ZM16 5v10'],
    target: ['M2 7V3h4m8 0h4v4m0 6v4h-4m-8 0H2v-4', 'M7 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0'],
    next: ['M2 10h12m-5-5 5 5-5 5M17 5v10'],
    arrow: ['M3 10h13m-5-5 5 5-5 5'],
    rewind: ['M10 4l-7 6 7 6zM17 4l-7 6 7 6z'],
    list: ['M7 5h10M7 10h8M7 15h10M3 5h.1M3 10h.1M3 15h.1'],
  };
  function icon(el, name) {
    if (!el) return;
    el.dataset.icon = name;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 40;
    el.replaceChildren(cv);
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    ctx.strokeStyle = getComputedStyle(el).color;
    ctx.lineWidth = name === 'pause' ? 2.7 : 1.35;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const path of paths[name] ?? []) ctx.stroke(new Path2D(path));
  }
  all('i[data-icon]').forEach((el) => icon(el, el.dataset.icon));
  const field = new Optics.Field($('fieldCanvas'));
  const query = new URLSearchParams(location.search);
  const seedText = query.get('seed');
  const initialSeed =
    seedText !== null && /^\d+$/.test(seedText) && Number(seedText) <= 4294967295
      ? Number(seedText)
      : 4172;
  const initialEnv = ['jade', 'amber', 'balanced'].includes(query.get('environment'))
    ? query.get('environment')
    : 'balanced';
  let book,
    history = null,
    selected = null,
    view = 'field',
    detail = 'anatomy';
  let running = true,
    cinema = false,
    follow = true,
    zoom = 2.15,
    center = { x: 480, y: 300 };
  let currentBranch = 1,
    rootFamily = 1,
    page = 0,
    treeHits = [],
    replayToken = 0,
    pending = false;
  let statusTimer = 0,
    lastFrame = 0,
    uiTime = -1000,
    credit = 0,
    opticalTime = 0,
    nextShot = 0,
    caption = '';
  let atlasCache = null,
    detailKey = '',
    eventKey = '',
    formResume = false;
  let watch = null,
    pairing = false,
    initialShare = [],
    habitatPoints = [];
  const w = () => history ?? book.world;
  function notice(msg) {
    $('status').textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => ($('status').textContent = ''), 2500);
  }
  function nearestShowpiece(world) {
    const robust = world.organisms.filter(
      (o) => o.traits.lifeSpan - o.age > 75 && o.energy > o.traits.maxEnergy * 0.3,
    );
    return (robust.length ? robust : world.organisms).reduce((best, o) => {
      const score =
        o.traits.radius +
        3 * o.traits.fins +
        (5 * o.energy) / o.traits.maxEnergy +
        Math.min(3, o.generation) * 1.2 -
        Math.hypot(o.x - world.width * 0.52, o.y - world.height * 0.49) * 0.023;
      return !best || score > best.score ? { o, score } : best;
    }, null)?.o;
  }
  function choose(o, snap = false) {
    if (!o) return;
    selected = o;
    currentBranch = o.lineage;
    detailKey = '';
    follow = true;
    if (snap) {
      center = { x: o.x, y: o.y };
    }
  }
  function create(seed, environment, mutation, warm) {
    replayToken++;
    book = new RecordBook.Culture({ seed, environment, mutation }, Cambrian);
    initialShare = book.world.jade.map((jade, i) => jade / (jade + book.world.amber[i]));
    book.advance(warm);
    history = null;
    pending = false;
    selected = null;
    currentBranch = 1;
    rootFamily = 1;
    atlasCache = null;
    eventKey = '';
    watch = null;
    credit = 0;
    cinema = false;
    caption = '';
    running = true;
    zoom = 2.15;
    choose(nearestShowpiece(book.world), true);
    changeView('field');
    $('seedLabel').textContent = pad(seed, 6);
    paint(performance.now(), true);
  }
  function alignAtlas() {
    const world = w();
    if (!world.lineages[currentBranch - 1]) currentBranch = world.lineages[0]?.id ?? 1;
    rootFamily = Plots.familyOf(world, currentBranch) ?? 1;
    page = Math.max(
      0,
      Math.floor(
        Plots.familyRows(world, rootFamily).findIndex((l) => l.id === currentBranch) / Plots.pageSize,
      ),
    );
    atlasCache = null;
  }
  function changeView(next) {
    view = next;
    atlasCache = null;
    all('[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
    $('fieldView').hidden = view !== 'field';
    $('atlasView').hidden = view !== 'atlas';
    $('ecologyView').hidden = view !== 'ecology';
    $('viewTitle').textContent = { field: 'Microscope', atlas: 'Lineage atlas', ecology: 'Ecology' }[
      view
    ];
    icon($('viewIcon'), { field: 'aperture', atlas: 'branch', ecology: 'pulse' }[view]);
    if (view !== 'field') {
      cinema = false;
      caption = '';
    }
    if (view === 'atlas') alignAtlas();
    invalidate();
  }
  const inval = () => {
    uiTime = -1000;
  };
  function invalidate() {
    uiTime = -1000;
    detailKey = '';
    eventKey = '';
  }
  all('[data-view]').forEach((b) => (b.onclick = () => changeView(b.dataset.view)));
  document.querySelector('.brand').onclick = (e) => {
    e.preventDefault();
    changeView('field');
  };
  all('[data-detail]').forEach(
    (b) =>
      (b.onclick = () => {
        detail = b.dataset.detail;
        all('[data-detail]').forEach((o) => o.classList.toggle('active', b === o));
        invalidate();
      }),
  );
  function openAtlas() {
    if (selected) currentBranch = selected.lineage;
    changeView('atlas');
  }
  $('cladeLink').onclick = openAtlas;
  $('trace').onclick = openAtlas;
  function loopMembers() {
    const world = w();
    if (!world.organisms.length) return;
    const index = world.organisms.findIndex((o) => o.id === selected?.id);
    choose(world.organisms[(index + 1) % world.organisms.length], true);
    changeView('field');
    invalidate();
  }
  $('nextSpecimen').onclick = loopMembers;
  function toggle() {
    if (pending || $('modal').open) return;
    running = !running;
    credit = 0;
    invalidate();
  }
  $('play').onclick = toggle;
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && cinema && !$('modal').open) {
      cinema = false;
      caption = '';
      invalidate();
    }
    if (
      e.code === 'Space' &&
      !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'A'].includes(e.target.tagName) &&
      !$('modal').open
    ) {
      e.preventDefault();
      toggle();
    }
  });
  function leaveHistory() {
    replayToken++;
    pending = false;
    history = null;
    watch = null;
    credit = 0;
    caption = '';
    atlasCache = null;
    const live = w().organisms.find((o) => o.id === selected?.id) ?? nearestShowpiece(w());
    selected = null;
    choose(live, true);
    if (view === 'atlas') alignAtlas();
    invalidate();
  }
  $('returnLive').onclick = () => {
    leaveHistory();
    running = true;
  };
  $('step').onclick = () => {
    if (pending) return;
    running = false;
    advance(1);
    invalidate();
  };
  $('speed').onchange = () => (credit = 0);
  const speed = () => Number($('speed').value);
  function advance(n) {
    if (!history) {
      book.advance(n);
      return;
    }
    const stop = Math.min(history.tick + n, book.world.tick, watch?.until ?? Infinity);
    while (history.tick < stop) {
      const next = book.actions.find((a) => a.tick > history.tick)?.tick ?? Infinity;
      history.step(Math.min(next, stop) - history.tick);
      for (const a of book.actions) if (a.tick === history.tick) history.action(a.action);
    }
    if (watch && history.tick >= watch.tick) {
      const actor = history.organisms.find((o) => o.id === watch.actor);
      if (actor && actor !== selected) choose(actor);
      if (history.tick === watch.until) {
        watch = null;
        running = false;
      }
    }
    if (history.tick === book.world.tick) {
      leaveHistory();
      running = false;
    }
  }
  async function seek(tick, id = null, fieldView = false) {
    watch = null;
    const token = ++replayToken;
    running = false;
    cinema = false;
    pending = true;
    caption = '';
    $('status').textContent = 'Reconstructing tick ' + fmt(tick) + '…';
    clearTimeout(statusTimer);
    invalidate();
    const snap = await book.reconstruct(tick, () => replayToken === token);
    if (!snap || token !== replayToken) return false;
    history = snap;
    pending = false;
    atlasCache = null;
    selected = null;
    choose(snap.organisms.find((o) => o.id === id) ?? nearestShowpiece(snap), true);
    if (fieldView) changeView('field');
    else if (view === 'atlas') alignAtlas();
    $('status').textContent = '';
    invalidate();
    paint(performance.now(), true);
    return true;
  }
  $('scrub').oninput = () => {
    running = false;
    seek(Number($('scrub').value));
  };
  $('historyChart').onclick = (e) => {
    const b = $('historyChart').getBoundingClientRect();
    seek(
      Math.round(clamp((e.clientX - b.left - 37) / Math.max(1, b.width - 46), 0, 1) * book.world.tick),
    );
  };
  async function replayEvent(e) {
    const actor = e.organismId,
      subject = e.type === 'birth' ? e.parentId : actor;
    if (!(await seek(Math.max(0, e.tick - 14), subject, true))) return;
    watch = { tick: e.tick, until: Math.min(book.world.tick, e.tick + 10), actor };
    caption = eventName(e) + ' · recorded at t ' + fmt(e.tick);
    $('speed').value = '1';
    running = true;
  }
  function eventName(e) {
    switch (e.type) {
      case 'founding':
        return 'Culture inoculated';
      case 'birth':
        return 'Fission · specimen ' + e.organismId;
      case 'death':
        return (
          (e.reason === 'senescence'
            ? 'Senescence'
            : e.reason === 'starvation'
              ? 'Starvation'
              : 'Death') +
          ' · ' +
          e.organismId
        );
      case 'divergence':
      case 'speciation':
        return 'Lineage ' + e.lineage + ' branched';
      case 'predation':
        return 'Lethal contact · ' + e.organismId + ' → ' + e.preyId;
      case 'extinction':
        return 'Lineage ' + e.lineage + ' ended';
      case 'environment':
        return title(e.environment) + ' renewal';
      default:
        return title(e.type);
    }
  }
  function updateEvents(world) {
    const list = history ? world.events : book.events;
    const newest = list.at(-1);
    const key =
      view +
      '|' +
      (history ? 'h' : 'l') +
      '|' +
      list.length +
      '|' +
      newest?.tick +
      '|' +
      newest?.type +
      '|' +
      newest?.organismId;
    if (key === eventKey || $('events').contains(document.activeElement)) return;
    eventKey = key;
    const recent = list.slice().reverse(),
      kinds = new Set(),
      shown = [];
    for (const event of recent) {
      const kind = event.type;
      if (kind === 'founding' || kinds.has(kind)) continue;
      kinds.add(kind);
      shown.push(event);
      if (shown.length === 4) break;
    }
    for (const event of recent) {
      if (shown.length >= 4) break;
      if (!shown.includes(event)) shown.push(event);
    }
    shown.sort((a, b) => b.tick - a.tick);
    $('logCount').textContent = history ? 'ARCHIVE' : 'RECENT';
    $('events').replaceChildren(
      ...shown.map((e) => {
        const b = document.createElement('button');
        b.className = 'event';
        const glyph = document.createElement('b');
        glyph.textContent =
          {
            birth: '⑂',
            environment: '≈',
            predation: '⟡',
            death: '−',
            founding: '✳',
            divergence: '⑂',
            speciation: '⑂',
          }[e.type] ?? '·';
        const label = document.createElement('span');
        label.textContent = eventName(e);
        const t = document.createElement('small');
        t.textContent = 't ' + fmt(e.tick);
        b.append(glyph, label, t);
        b.title = 'Revisit this observation';
        b.onclick = () => replayEvent(e);
        return b;
      }),
    );
    if (!shown.length) $('events').innerHTML = '<p class="empty">No events recorded at this time.</p>';
  }
  const units = (n) => Number(n).toFixed(1) + ' E';
  const row = (label, value) =>
    '<div class="data-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
  function inspect(world) {
    const o = selected;
    const node = world.lineages[currentBranch - 1];
    if (!o && !node) {
      $('detail').textContent = 'No specimens at this time.';
      return;
    }
    const representative = o ?? {
      id: node.founderId,
      lineage: node.id,
      genome: node.genome,
      generation: node.generation,
    };
    const gene = representative.genome;
    $('specName').textContent = 'Specimen ' + pad(representative.id);
    $('cladeLink').textContent = 'Lineage ' + pad(representative.lineage, 3) + ' ↗';
    $('plateId').textContent = 'GEN ' + pad(representative.generation, 3);
    const key = [detail, representative.id, detail === 'anatomy' ? world.tick : '', !!history].join('/');
    if (detailKey === key) return;
    const oldScroll = $('detail').firstElementChild?.scrollTop ?? 0;
    detailKey = key;
    if (detail === 'genome') {
      $('detail').innerHTML =
        '<div class="genes">' +
        Cambrian.GENES.map(
          (g, i) =>
            '<div class="gene"><span>' +
            g +
            '</span><span class="bar"><b style="width:' +
            100 * gene[i] +
            '%"></b></span><small>' +
            gene[i].toFixed(2) +
            '</small></div>',
        ).join('') +
        '</div>';
      $('detail').firstElementChild.scrollTop = oldScroll;
    } else if (detail === 'ancestry') {
      const chain = world.ancestry(representative.id, 64);
      $('detail').innerHTML =
        '<div class="ancestors">' +
        chain
          .map(
            (a, i) =>
              '<button class="ancestor" data-ancestor="' +
              a.id +
              '" data-birth="' +
              a.birth +
              '"><span>' +
              (i === 0 ? 'This body' : '↳ ' + i) +
              ' · ' +
              pad(a.id) +
              '</span><span>g ' +
              a.generation +
              ' ↗</span></button>',
          )
          .join('') +
        '</div>';
      $('detail').firstElementChild.scrollTop = oldScroll;
    } else if (o) {
      const state =
        o.death != null
          ? 'Died at t ' + o.death
          : o.feed === 'prey'
            ? 'Contact feeding'
            : o.feed === 'jade'
              ? 'Jade uptake'
              : o.feed === 'amber'
                ? 'Amber uptake'
                : 'Swimming';
      $('detail').innerHTML =
        row('Activity', state) +
        row('Reserve', units(o.energy) + ' / ' + Math.round(o.traits.maxEnergy)) +
        row('Age / offspring', fmt(o.age) + ' t / ' + fmt(o.offspring)) +
        row('Intake / losses', units(o.intake) + ' / ' + units(o.spent)) +
        row('Given to young', units(o.offspringEnergy)) +
        '<div class="investments">' +
        ['tail', 'jaw']
          .map(
            (g) =>
              '<span>' +
              title(g) +
              '<span class="bar"><b style="width:' +
              100 * o.traits[g] +
              '%"></b></span>' +
              Math.round(100 * o.traits[g]) +
              '%</span>',
          )
          .join('') +
        '</div>';
    } else {
      $('detail').innerHTML =
        row('Branch founder', '#' + node.founderId) +
        row('Origin', fmt(node.origin) + ' t') +
        row('Direct members', fmt(node.living)) +
        row('Branch status', node.extinct === null ? 'Living' : 'Ended at ' + fmt(node.extinct));
    }
  }
  $('detail').onclick = (e) => {
    const b = e.target.closest('[data-ancestor]');
    if (b) seek(Number(b.dataset.birth), Number(b.dataset.ancestor), true);
  };
  function switchBranch(id) {
    const world = w(),
      l = world.lineages[id - 1];
    if (!l) return;
    currentBranch = l.id;
    selected = world.organisms.find((o) => o.lineage === l.id) ?? null;
    rootFamily = Plots.familyOf(world, id);
    detailKey = '';
    invalidate();
  }
  function atlas(world) {
    const key = [world.lineages.length, rootFamily, page].join('/');
    if (!atlasCache || atlasCache.world !== world || atlasCache.key !== key) {
      const rows = Plots.familyRows(world, rootFamily),
        roots = world.lineages.filter((l) => !l.parentId);
      if (!rows.length) return;
      const option = (l) => new Option('L·' + pad(l.id, 3), l.id);
      $('family').replaceChildren(...roots.map(option));
      $('family').value = String(rootFamily);
      page = clamp(page, 0, Math.ceil(rows.length / Plots.pageSize) - 1);
      $('branch').replaceChildren(
        ...rows.slice(page * Plots.pageSize, (page + 1) * Plots.pageSize).map(option),
      );
      atlasCache = { key, world, rows };
    }
    const rows = atlasCache.rows;
    $('familyTitle').textContent = 'Family ' + pad(rootFamily, 3);
    $('familyStats').textContent =
      fmt(rows.length) +
      ' recorded ' +
      (rows.length === 1 ? 'branch' : 'branches') +
      ' · ' +
      fmt(rows.filter((l) => l.living > 0).length) +
      ' living. Select a branch to inspect it.';
    $('branch').value = String(currentBranch);
    const l = world.lineages[currentBranch - 1],
      parent = l?.parentId;
    $('parentBranch').hidden = !parent;
    if (parent) $('parentBranch').textContent = 'Parent L·' + parent + ' ↖';
    treeHits = Plots.tree($('treeCanvas'), rows, page, currentBranch, world.tick);
    $('treePage').textContent = page + 1 + ' / ' + Math.ceil(rows.length / Plots.pageSize);
    $('nextBranches').disabled = (page + 1) * Plots.pageSize >= rows.length;
    $('prevBranches').disabled = page === 0;
    $('findMember').disabled = !world.lineages[currentBranch - 1]?.living;
  }
  $('parentBranch').onclick = () => {
    const id = w().lineages[currentBranch - 1]?.parentId;
    if (id) {
      switchBranch(id);
      alignAtlas();
    }
  };
  $('family').onchange = () => {
    switchBranch(Number($('family').value));
    page = 0;
    atlasCache = null;
  };
  $('branch').onchange = () => switchBranch(Number($('branch').value));
  $('treeCanvas').onclick = (e) => {
    const y = e.clientY - $('treeCanvas').getBoundingClientRect().top;
    const hit = treeHits.find((b) => Math.abs(y - b.y) <= 10);
    if (hit) switchBranch(hit.id);
  };
  function shiftPage(by) {
    const rows = atlasCache?.rows;
    if (!rows) return;
    page += by;
    switchBranch(rows[page * Plots.pageSize].id);
    atlasCache = null;
  }
  $('prevBranches').onclick = () => shiftPage(-1);
  $('nextBranches').onclick = () => shiftPage(1);
  $('branchOrigin').onclick = () => {
    const l = w().lineages[currentBranch - 1];
    if (l) seek(l.origin, l.founderId, true);
  };
  $('findMember').onclick = () => {
    const o = w().organisms.find((x) => x.lineage === currentBranch);
    if (o) {
      choose(o, true);
      changeView('field');
    }
  };
  Cambrian.GENES.forEach((g, i) => $('trait').add(new Option(title(g), i)));
  $('trait').value = String(Cambrian.GENES.indexOf('gut'));
  $('trait').onchange = inval;
  $('metric').onchange = inval;
  $('habitatChart').onclick = (e) => {
    const r = $('habitatChart').getBoundingClientRect();
    const point = habitatPoints.reduce((best, p) => {
      const d = Math.hypot(e.clientX - r.left - p.x, e.clientY - r.top - p.y);
      return d <= 9 && (!best || d < best.d) ? { d, o: p.o } : best;
    }, null);
    if (point && w().organisms.includes(point.o)) {
      choose(point.o, true);
      changeView('field');
    }
  };
  function ecology(world, s, series) {
    $('mixtureTitle').textContent =
      (world.environment === 'balanced' ? 'Balanced' : title(world.environment) + '-rich') + ' chamber';
    Plots.histogram($('histogram'), world.organisms, Number($('trait').value));
    Plots.series($('diversityChart'), series, 'diversity', world.tick);
    habitatPoints = Plots.habitat($('habitatChart'), world, initialShare, Cambrian.GENES.indexOf('gut'));
    const avg = (group) =>
      group.length
        ? ((100 * group.reduce((n, p) => n + p.share, 0)) / group.length).toFixed(1) + '%'
        : '—';
    const low = habitatPoints.filter((p) => p.g < 1 / 3),
      high = habitatPoints.filter((p) => p.g >= 2 / 3);
    $('occupancy').textContent =
      'Initial jade share at occupied sites · low-gut mean ' +
      avg(low) +
      ' · high-gut mean ' +
      avg(high) +
      '. Click a point to find its organism.';
    const parts = [
      ['Jade', s.diet.jade, '#93c99f'],
      ['Amber', s.diet.amber, '#d8b679'],
      ['Tissue', s.diet.prey, '#ce947f'],
    ];
    const total = parts.reduce((sum, p) => sum + p[1], 0);
    $('diet').innerHTML =
      '<div class="energy-bar">' +
      parts
        .map(
          (p) =>
            '<span style="background:' +
            p[2] +
            ';width:' +
            (total ? (100 * p[1]) / total : 0) +
            '%"></span>',
        )
        .join('') +
      '</div><div class="energy-legend">' +
      parts
        .map(
          (p) =>
            '<span><b style="background:' +
            p[2] +
            '"></b>' +
            p[0] +
            ' ' +
            fmt(Math.round(p[1])) +
            ' E</span>',
        )
        .join('') +
      '</div>';
    const contacts = history ? world.events.filter((e) => e.type === 'predation') : book.contacts;
    const latest = contacts.slice(-3).reverse();
    $('links').innerHTML = latest.length
      ? latest
          .map(
            (e, i) =>
              '<button data-contact="' +
              i +
              '"><span>L·' +
              e.preyLineage +
              '</span> → <span>L·' +
              e.lineage +
              '</span> <small>t ' +
              fmt(e.tick) +
              ' ↗</small></button>',
          )
          .join('')
      : '<span class="hint">No lethal contacts in the retained observations.</span>';
    $('links').onclick = (e) => {
      const b = e.target.closest('[data-contact]');
      if (b) replayEvent(latest[Number(b.dataset.contact)]);
    };
    const b = world.budget();
    let info =
      '<strong>Budget residual</strong> ' +
      b.balance.toExponential(1) +
      ' E · ' +
      fmt(Math.round(b.biomass)) +
      ' E in living reserves';
    if (book.control && !history) {
      const c = book.control.summary(),
        g = Cambrian.GENES.indexOf('gut');
      const mean = (x) => (x.population ? x.meanTraits[g].toFixed(3) : '—');
      info +=
        '<br><strong>Paired control</strong> · split at t ' +
        fmt(book.pairedAt) +
        '. Culture / control at t ' +
        fmt(s.tick) +
        ': ' +
        fmt(s.population) +
        ' / ' +
        fmt(c.population) +
        ' living, mean gut ' +
        mean(s) +
        ' / ' +
        mean(c) +
        '.';
    } else if (!history) {
      info += '<br>Changing the renewal mix starts a same-seed control for comparison.';
    }
    $('comparison').innerHTML = '<div class="counter">' + info + '</div>';
  }
  function update(world) {
    const s = world.summary();
    $('popStat').textContent = fmt(s.population);
    $('cladeStat').textContent = fmt(s.activeLineages);
    $('genStat').textContent = fmt(s.maxGeneration);
    $('birthStat').textContent = fmt(s.births);
    $('tickLabel').textContent = pad(world.tick, 6);
    $('scrub').max = String(Math.max(1, book.world.tick));
    if (!pending) $('scrub').value = String(world.tick);
    $('returnLive').disabled = !history && !pending;
    $('step').disabled = pending;
    $('play').disabled = pending;
    const playState = running ? 'pause' : 'play';
    if ($('play').firstElementChild.dataset.icon !== playState)
      icon($('play').firstElementChild, playState);
    $('play').setAttribute('aria-label', running ? 'Pause simulation' : 'Play simulation');
    document.querySelector('.workspace').classList.toggle('cinematic', cinema);
    $('cinema').setAttribute('aria-pressed', cinema);
    $('perturb').disabled = !!history || pending;
    $('liveText').textContent = history ? 'HISTORICAL FIELD' : running ? 'LIVE FIELD' : 'FIELD PAUSED';
    $('liveLamp').classList.toggle('paused', !running || !!history);
    $('zoomValue').textContent = zoom.toFixed(1) + '×';
    $('zoomIn').disabled = zoom >= 4.5;
    $('zoomOut').disabled = zoom <= 1;
    $('nextSpecimen').disabled = !s.population;
    inspect(world);
    updateEvents(world);
    const live = book.world,
      points = book.samples.slice();
    if (points.at(-1)?.tick !== live.tick) points.push(history ? live.summary() : s);
    Plots.series($('historyChart'), points, $('metric').value, world.tick);
    if (view === 'atlas') atlas(world);
    if (view === 'ecology') {
      const past = history ? points.filter((p) => p.tick < world.tick).concat([s]) : points;
      ecology(world, s, past);
    }
  }
  function directShot(now, world) {
    if (!world.organisms.length) {
      caption = 'The culture is extinct.';
      return;
    }
    const living = new Map(world.organisms.map((o) => [o.id, o]));
    const shots = world.events.filter((e) => living.has(e.organismId) && e.tick >= world.tick - 120);
    const event =
      shots.findLast((e) => ['predation', 'divergence', 'speciation'].includes(e.type)) ??
      shots.findLast((e) => e.type === 'birth');
    const o =
      living.get(event?.organismId) ??
      world.organisms.reduce((a, b) => (a.offspring > b.offspring ? a : b));
    choose(o);
    zoom = clamp(3.3 - o.traits.radius * 0.08, 2, 3.2);
    if (event?.type === 'divergence')
      caption =
        'A new branch · L·' +
        event.lineage +
        ' diverged from L·' +
        event.parentLineage +
        ' at tick ' +
        fmt(event.tick);
    else if (event?.type === 'predation')
      caption =
        'After a lethal contact · specimen ' +
        event.organismId +
        ' fed on ' +
        event.preyId +
        ' at tick ' +
        fmt(event.tick);
    else if (event)
      caption =
        'After fission · specimen ' +
        event.organismId +
        ' was born to ' +
        event.parentId +
        ' at tick ' +
        fmt(event.tick);
    else caption = 'Following specimen ' + pad(o.id) + ' · ' + o.offspring + ' offspring';
    nextShot = now + 7500;
  }
  $('cinema').onclick = () => {
    if (pending) return;
    if (view !== 'field') changeView('field');
    cinema = !cinema;
    caption = '';
    if (cinema) {
      running = true;
      directShot(performance.now(), w());
    }
    invalidate();
  };
  function magnify(factor) {
    zoom = clamp(zoom * factor, 1, 4.5);
    inval();
  }
  $('zoomIn').onclick = () => magnify(1.25);
  $('zoomOut').onclick = () => magnify(0.8);
  let drag = null;
  const cv = $('fieldCanvas');
  cv.onpointerdown = (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y, moved: false };
    cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    follow = false;
    cinema = false;
    caption = '';
    const scale = Math.min(cv.clientWidth / w().width, cv.clientHeight / w().height) * zoom;
    center = { x: wrap(drag.cx - dx / scale, w().width), y: wrap(drag.cy - dy / scale, w().height) };
    inval();
  };
  cv.onpointerup = (e) => {
    if (!drag) return;
    if (!drag.moved) {
      const id = field.pick(e.clientX, e.clientY),
        o = w().organisms.find((a) => a.id === id);
      if (o) {
        cinema = false;
        caption = '';
        choose(o);
        invalidate();
      }
    }
    drag = null;
  };
  cv.onpointercancel = () => (drag = null);
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      magnify(Math.exp(-0.0018 * clamp(e.deltaY, -160, 160)));
    },
    { passive: false },
  );
  function paint(now, force = false, dt = 0) {
    const world = w();
    const dead = selected && selected.death != null;
    if (cinema && (now >= nextShot || dead) && running) directShot(now, world);
    if (follow && selected && !dead && view === 'field') {
      const mix = 1 - Math.exp(-Math.min(dt, 80) * (cinema ? 0.0025 : 0.006));
      center.x = wrap(center.x + short(selected.x - center.x, world.width) * mix, world.width);
      center.y = wrap(center.y + short(selected.y - center.y, world.height) * mix, world.height);
    }
    if (view === 'field') {
      field.draw(world, { center, zoom, time: opticalTime, selectedId: selected?.id });
      const p = selected && !dead ? field.project(selected.x, selected.y) : null;
      const visible = p && p.x > 8 && p.x < cv.clientWidth - 8 && p.y > 8 && p.y < cv.clientHeight - 8;
      $('reticle').hidden = $('selectedTag').hidden = !visible;
      const scale = Math.min(cv.clientWidth / world.width, cv.clientHeight / world.height) * zoom;
      if (visible) {
        const r = clamp(selected.traits.radius * scale * 4 + 12, 34, 115);
        Object.assign($('reticle').style, {
          left: p.x + 'px',
          top: p.y + 'px',
          width: r + 'px',
          height: r + 'px',
        });
        $('selectedTag').style.left = clamp(p.x + r * 0.5 + 4, 2, cv.clientWidth - 84) + 'px';
        $('selectedTag').style.top = clamp(p.y - r * 0.5 - 3, 3, cv.clientHeight - 18) + 'px';
        $('selectedTag').textContent = 'SP. ' + pad(selected.id);
      }
      const units = scale > 2 ? 20 : 50;
      $('scaleLine').style.width = units * scale + 'px';
      $('scaleText').textContent = units + ' µm';
      $('caption').hidden = !caption;
      $('caption').textContent = caption;
    }
    const l = world.lineages[currentBranch - 1];
    const specimen =
      selected ??
      (l
        ? {
            id: l.founderId,
            lineage: l.id,
            generation: l.generation,
            genome: l.genome,
            traits: Cambrian.traits(l.genome),
            age: 0,
            angle: 0,
            speed: 0,
          }
        : null);
    Optics.portrait($('portrait'), specimen, selected && selected.death == null ? opticalTime : 0);
    if (force || now - uiTime > 190) {
      update(world);
      uiTime = now;
    }
  }
  function frame(now) {
    const dt = lastFrame ? Math.max(0, Math.min(120, now - lastFrame)) : 0;
    lastFrame = now;
    if (running && !pending && !$('modal').open && !document.hidden) {
      opticalTime += dt / 1000;
      credit += dt * 0.015 * speed();
      const n = Math.min(96, Math.floor(credit));
      if (n) {
        advance(n);
        credit -= n;
      }
    }
    if (!document.hidden) paint(now, false, dt);
    requestAnimationFrame(frame);
  }
  function modal(kicker, html) {
    formResume = running;
    running = false;
    $('modalKicker').textContent = kicker;
    $('modalBody').innerHTML = html;
    $('modal').showModal();
    invalidate();
  }
  function close() {
    if ($('modal').open) $('modal').close();
  }
  $('closeModal').onclick = close;
  $('modal').addEventListener('close', () => {
    if (pairing) {
      replayToken++;
      pairing = false;
      pending = false;
    }
    running = formResume;
    credit = 0;
    invalidate();
  });
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) {
      const r = $('modal').getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        close();
    }
  });
  $('configure').onclick = () => {
    modal(
      'CULTURE SETTINGS',
      '<h3>Start a new culture</h3><p>Inoculate a fresh chamber at tick zero. Export this culture first to keep its history.</p><form id="newForm"><div class="modal-group"><label>Seed <input id="seedInput" type="number" min="0" max="4294967295" step="1" required value="' +
        book.options.seed +
        '"></label><label>Renewal mix <select id="newEnv"><option value="balanced">Balanced</option><option value="jade">Jade-rich</option><option value="amber">Amber-rich</option></select></label><label><input type="checkbox" id="newMutation" checked> Allow inherited mutations</label></div><div class="modal-buttons"><button type="submit" class="primary">Start culture</button></div></form>',
    );
    $('newForm').onsubmit = (e) => {
      e.preventDefault();
      const seed = Number($('seedInput').value),
        env = $('newEnv').value,
        mutation = $('newMutation').checked;
      formResume = true;
      close();
      create(seed, env, mutation, 0);
      notice('New culture inoculated');
    };
  };
  $('perturb').onclick = () => {
    if (history || pending) return;
    const model = book,
      prior = model.world.environment;
    modal(
      'ENVIRONMENT',
      '<h3>Change the renewal mix</h3><p>Shift which substrate the water replenishes. Existing food remains available while the resource field adjusts.</p><div class="modal-group"><h4>Resource renewal</h4><div class="modal-buttons" id="mixButtons"></div></div><p id="pairNote">' +
        (model.control
          ? 'The paired control continues under its original renewal mix.'
          : 'The first change forks a control at this tick. Compare both cultures under Ecology.') +
        '</p>',
    );
    for (const env of Cambrian.ENVIRONMENTS) {
      const b = document.createElement('button');
      b.textContent = env === 'balanced' ? 'Balanced' : title(env) + '-rich';
      b.className = env === prior ? 'chosen' : '';
      b.disabled = env === prior;
      b.onclick = async () => {
        for (const other of $('mixButtons').children) other.disabled = true;
        $('pairNote').textContent = 'Preparing the matched control…';
        const token = ++replayToken,
          wasRunning = formResume;
        pending = true;
        pairing = true;
        const active = () => model === book && token === replayToken && $('modal').open;
        if (!(await model.pair(active)) || !active()) return;
        pairing = false;
        pending = false;
        model.expose(env);
        formResume = wasRunning;
        close();
        notice('Renewal changed · control retained');
        invalidate();
      };
      $('mixButtons').append(b);
    }
  };
  $('guide').onclick = () =>
    modal(
      'FIELD GUIDE',
      '<h3>Reading the chamber</h3><p>Every body in the field is an individual. Click one to follow it, drag the water to pan, and use the lens buttons to magnify it.</p><div class="modal-group"><h4>Read an organism</h4><p>Size changes reserve capacity. Tail investment affects propulsion, fin investment affects turning, and jaws and spines change energy transfer on contact. Gut chemistry determines the relative return from amber and jade food. Open Genome to read the inherited values.</p></div><div class="modal-group"><h4>Read its history</h4><p>Trace lineage opens the selected family. A new branch records genetic distance from a clade founder. Each line ends at its last direct member. Select an ancestor, a branch origin, a field log event or a point on the census to revisit that tick. Press play to follow the recorded trajectory.</p></div><div class="modal-group"><h4>Run an experiment</h4><p>Change the environment to fork a matched control. Ecology plots the gut distribution, lineage diversity, energy intake and the paired result. The seed control can start a mutation-free chamber. Export run saves the settings, timed exposures and measured history for headless replay.</p></div><div class="modal-group"><h4>From the experimental notebook</h4><p>In reciprocal gardens, populations raised on one food performed better when they encountered it again. Equalizing the gut locus largely removed that advantage across six training seeds. Gut chemistry changes how efficiently each food is absorbed.</p><p>In a balanced mosaic, low- and high-gut organisms occupied different habitats. Open the seed-73 study at tick 14,400 and click a point to see the individual in its own patch.</p><a class="study-link" href="?study=mosaic" target="_blank" rel="noopener">Open mosaic study ↗</a></div>',
    );
  $('export').onclick = () => {
    const final = book.world.summary();
    const samples = book.samples.at(-1)?.tick === final.tick ? book.samples : [...book.samples, final];
    const data = {
      ...book.export(),
      samples,
      final,
      budget: book.world.budget(),
      inspection: {
        tick: w().tick,
        branch: currentBranch,
        organismId: selected?.id ?? null,
        genome: selected?.genome ?? w().lineages[currentBranch - 1]?.genome ?? null,
        ancestry: selected ? w().ancestry(selected.id, 64) : [],
      },
    };
    if (book.control)
      data.control = {
        splitTick: book.pairedAt,
        environment: book.control.environment,
        final: book.control.summary(),
        record: { ...book.export(), actions: book.controlActions },
      };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cambrian-' + book.options.seed + '-t' + book.world.tick + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Culture record exported');
  };
  const study = query.get('study') === 'mosaic';
  create(study ? 73 : initialSeed, study ? 'balanced' : initialEnv, true, study ? 0 : 296);
  async function openStudy() {
    pending = true;
    running = false;
    const main = document.querySelector('main'),
      mast = document.querySelector('.mast');
    main.inert = mast.inert = true;
    while (book.world.tick < 14400) {
      $('status').textContent =
        'Reconstructing the mosaic study · tick ' + fmt(book.world.tick) + ' / 14,400';
      await new Promise((resolve) => setTimeout(resolve, 0));
      const start = performance.now();
      do {
        book.advance(Math.min(32, 14400 - book.world.tick));
      } while (book.world.tick < 14400 && performance.now() - start < 16);
    }
    pending = false;
    running = false;
    main.inert = mast.inert = false;
    $('status').textContent = '';
    choose(nearestShowpiece(w()), true);
    changeView('ecology');
    invalidate();
  }
  window.CambrianStation = {
    observe: () => ({
      view,
      detail,
      history: !!history,
      running,
      pending,
      selectedId: selected?.id ?? null,
      branch: currentBranch,
      zoom,
      control: book.control?.summary() ?? null,
      summary: w().summary(),
      record: book.export(),
    }),
  };
  if (study) openStudy();
  requestAnimationFrame(frame);
})();
