import * as T from '../vendor/three.module.js';
import { WorldStore } from './world.js';
import { PortalRenderer } from './portals.js';
import { EYE } from './spatial.js';
import { ground } from './geography.js';
import { field } from './atlas.js';
import { Journal, loadPose, savePose } from './journal.js';
import { look, opening, walk } from './walker.js';
import { GpuTimer } from './timing.js';
import { Passage, duration } from './passage.js';
import { Soundscape } from './sound.js';
import { el, label, notify, bearing, journalPage } from './interface.js';

async function start() {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Explore the portal atlas');
  el('stage').append(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const camera = new T.PerspectiveCamera(58, 1, 0.06, 680),
    store = new WorldStore(),
    portals = new PortalRenderer(renderer);
  const sound = new Soundscape(),
    keys = new Set();
  const timer = new GpuTimer(renderer.getContext()),
    profile = new URLSearchParams(location.search).has('profile');
  let book;
  try {
    book = await Journal.open();
  } catch {
    notify('Journal storage is unavailable in this browser.');
  }
  const getWorld = (id) => {
    const w = store.get(id);
    if (!w.hydrating && book) {
      w.hydrating = true;
      book
        .read(id)
        .then((record) => {
          if (!w.tuned) {
            w.tuned = !!record?.tuned;
            w.setTuned(w.tuned);
          }
          if (!w.links) {
            w.links = record?.links || {};
            w.setLinks(w.links);
          }
        })
        .catch(storageError);
    }
    return w;
  };
  let mode = 'cover',
    player = opening(),
    tour = null,
    returnPose = null,
    info = {},
    page = 0,
    journalOrigin = 'cover',
    lastSave = -10;
  let depth = 3,
    budget = 5,
    adaptive = true,
    scale = 1,
    avg = 16.7,
    frames = 0,
    dtSample = 0,
    accum = 0,
    last = performance.now(),
    lastUi = 0,
    sinceQuality = 0;
  let peakDepth = 0,
    locked = false,
    drag = null,
    hintUntil = 0,
    crossings = 0;
  const samples = [],
    restore = loadPose();
  function storageError() {
    notify('The browser could not save this field note.');
  }
  function setMode(next) {
    mode = next;
    document.body.dataset.mode = next;
    keys.clear();
    el('tour').hidden = next !== 'guide';
    el('prompt').hidden = true;
    el('hint').hidden = true;
    if (next !== 'walk' && document.pointerLockElement) document.exitPointerLock();
  }
  function unpack(p) {
    player.id = p.id;
    player.position.fromArray(p.position);
    player.orientation.fromArray(p.orientation).normalize();
    player.velocity.set(0, 0, 0);
  }
  const pack = () => ({
    id: player.id,
    position: player.position.toArray(),
    orientation: player.orientation.toArray(),
  });
  function visit() {
    const w = getWorld(player.id);
    label(w);
    sound.enter(w.biome);
  }
  function save() {
    if (mode !== 'guide' && !(mode === 'journal' && journalOrigin === 'guide') && !savePose(player))
      storageError();
  }
  function crossed(from, gate, exit) {
    crossings++;
    visit();
    if (mode === 'walk') {
      book
        ?.traverse(from, gate, exit)
        .then(async () => {
          for (const id of new Set([from, gate.to])) {
            const w = store.entries.get(id);
            if (w) {
              const record = await book.read(id);
              w.links = record.links;
              w.setLinks(w.links);
            }
          }
        })
        .catch(storageError);
      save();
    }
  }
  if (restore) unpack(restore);
  visit();
  book?.visit(player.id).catch(storageError);
  if (restore) el('enter').firstChild.textContent = 'Resume exploration ';
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * scale);
    renderer.setSize(innerWidth, innerHeight, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  resize();
  addEventListener('resize', resize);
  function lock() {
    canvas.focus({ preventScroll: true });
    try {
      canvas.requestPointerLock?.()?.catch(() => {});
    } catch {}
  }
  function enter() {
    setMode('walk');
    hintUntil = performance.now() + 5900;
    lock();
    el('enter').firstChild.textContent = 'Resume exploration ';
  }
  function pause() {
    if (mode === 'walk') save();
    setMode('cover');
    player.velocity.set(0, 0, 0);
  }
  function guide() {
    if (mode === 'guide') {
      endGuide();
      return;
    }
    if (mode === 'walk') save();
    returnPose = pack();
    player = opening();
    tour = new Passage();
    setMode('guide');
    visit();
  }
  function endGuide() {
    tour = null;
    if (returnPose) unpack(returnPose);
    returnPose = null;
    setMode('cover');
    visit();
  }
  function closeBook(reenter = true) {
    el('journal').close();
    setMode(journalOrigin);
    if (reenter && journalOrigin === 'walk') lock();
  }
  function recall(id) {
    el('journal').close();
    tour = null;
    returnPose = null;
    player = opening();
    player.id = id;
    if (id !== '1') {
      player.position.set(0, EYE, 10.7);
      player.orientation.setFromEuler(new T.Euler(0.05, 0, 0, 'YXZ'));
    }
    visit();
    enter();
    save();
  }
  async function showPage() {
    if (book) await journalPage(book, page, player.id, recall).catch(storageError);
    else el('journal-count').textContent = 'Storage is unavailable.';
  }
  function openBook() {
    if (mode === 'journal') {
      closeBook();
      return;
    }
    journalOrigin = mode;
    setMode('journal');
    page = 0;
    el('journal').showModal();
    showPage();
  }
  function nearby() {
    const w = getWorld(player.id),
      [x, z] = w.beacon;
    return Math.hypot(player.position.x - x, player.position.z - z) < 2.65;
  }
  function tune() {
    if (mode !== 'walk' || !nearby()) return;
    const w = getWorld(player.id);
    w.tuned = true;
    w.setTuned(true);
    sound.strike();
    book?.tune(w.id).catch(storageError);
    notify(field[w.biome][3] + ' sounded');
  }
  el('enter').onclick = enter;
  el('guide').onclick = guide;
  el('leave-tour').onclick = endGuide;
  el('journal-button').onclick = openBook;
  document.querySelector('.paper-close').onclick = () => closeBook();
  el('journal').oncancel = (e) => {
    e.preventDefault();
    closeBook();
  };
  el('next').onclick = () => {
    page++;
    showPage();
  };
  el('prev').onclick = () => {
    page--;
    showPage();
  };
  el('sound').onclick = async () => {
    const enabled = await sound.toggle();
    el('sound-glyph').setAttribute('href', enabled ? '#sound-icon' : '#mute-icon');
    el('sound').setAttribute('aria-label', enabled ? 'Mute ambient sound' : 'Enable ambient sound');
    el('sound').setAttribute('aria-pressed', String(enabled));
  };
  el('hide-metrics').onclick = () => {
    el('instruments').hidden = true;
  };
  el('depth').oninput = (e) => (depth = Number(e.target.value));
  el('budget').oninput = (e) => (budget = Number(e.target.value));
  el('adaptive').onchange = (e) => {
    adaptive = e.target.checked;
    if (!adaptive) {
      scale = 1;
      resize();
    }
  };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyJ' && !e.repeat) {
      e.preventDefault();
      openBook();
      return;
    }
    if (mode === 'journal' || e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyI' && !e.repeat) {
      el('instruments').hidden = !el('instruments').hidden;
      return;
    }
    if (e.code === 'KeyG' && !e.repeat) {
      guide();
      return;
    }
    if (e.code === 'Escape') {
      if (mode === 'guide') endGuide();
      else if (mode === 'walk') pause();
      return;
    }
    if (mode !== 'walk') return;
    if (e.code === 'KeyE' && !e.repeat) tune();
    if (['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', 'Space'].includes(e.code))
      e.preventDefault();
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    drag = null;
  });
  addEventListener('pagehide', () => {
    if (mode === 'walk') save();
  });
  document.addEventListener('pointerlockchange', () => {
    const active = document.pointerLockElement === canvas;
    if (locked && !active && mode === 'walk') pause();
    locked = active;
  });
  canvas.onpointerdown = (e) => {
    if (mode === 'cover') {
      enter();
      return;
    }
    if (mode !== 'walk') return;
    drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointerup = () => {
    drag = null;
  };
  addEventListener('mousemove', (e) => {
    if (mode !== 'walk') return;
    if (locked) look(player, e.movementX * 0.0021, e.movementY * 0.0021);
    else if (drag) {
      look(player, (e.clientX - drag[0]) * 0.004, (e.clientY - drag[1]) * 0.004);
      drag = [e.clientX, e.clientY];
    }
  });
  function stats() {
    return {
      ...info,
      ...store.stats(),
      id: player.id,
      pos: player.position.toArray(),
      quaternion: player.orientation.toArray(),
      velocity: player.velocity.toArray(),
      mode,
      crossings,
      peakDepth,
      gpuMs: timer.last,
      tuned: !!getWorld(player.id).tuned,
      frameMs: dtSample,
      scale,
      depthLimit: depth,
      passBudget: budget,
      demoSeconds: tour?.elapsed || 0,
      frames,
      width: canvas.width,
      height: canvas.height,
    };
  }
  window.threshold = { ready: false, inspect: stats, frameTimes: () => samples.slice() };
  function ui(now) {
    const w = getWorld(player.id),
      yaw = new T.Euler().setFromQuaternion(player.orientation, 'YXZ').y;
    bearing(yaw);
    if (mode === 'walk') {
      const near = nearby();
      el('prompt').hidden = !near;
      el('hint').hidden = near || now > hintUntil;
      if (near)
        el('prompt').querySelector('span').textContent =
          (w.tuned ? 'Ring again · ' : 'Sound the ') + field[w.biome][3].toLowerCase();
    }
    if (mode === 'guide') {
      document.querySelector('.track i').style.width = (tour.elapsed / duration) * 100 + '%';
      el('timecode').textContent = '0:' + String(Math.floor(tour.elapsed)).padStart(2, '0') + ' / 0:52';
    }
    if (!el('instruments').hidden) {
      const s = stats();
      el('metrics').textContent = [
        s.frameMs.toFixed(1) + ' ms/frame · ' + s.width + ' × ' + s.height,
        s.gpuMs === null ? 'GPU timer unavailable' : s.gpuMs.toFixed(2) + ' ms on GPU',
        s.calls + ' draw calls · ' + s.triangles.toLocaleString() + ' triangles',
        s.passes + ' scene views · ' + s.windows + ' visible gates',
        'Recursion ' + s.depth + ' / ' + depth + ' · budget ' + budget,
        s.worlds + ' / 8 worlds · ' + s.chunks + ' cached chunks',
        s.geometries + ' geometries · ' + s.textures + ' textures',
        s.targets + ' render targets · ' + s.evictions + ' world evictions',
      ].join('\n');
    }
  }
  renderer.setAnimationLoop((now) => {
    const ms = now - last;
    last = now;
    if (ms > 0 && ms < 500) {
      samples.push(ms);
      if (samples.length > 240) samples.shift();
      avg = avg * 0.96 + ms * 0.04;
    }
    const dt = Math.max(0, Math.min(0.1, ms / 1000));
    if (mode === 'walk') {
      for (let left = dt; left > 1e-8; left -= 1 / 60)
        walk(player, keys, Math.min(1 / 60, left), getWorld, crossed);
      if (now - lastSave > 2200) {
        save();
        lastSave = now;
      }
    } else if (mode === 'guide' && tour.step(player, dt, getWorld, crossed)) endGuide();
    camera.position.copy(player.position);
    camera.quaternion.copy(player.orientation);
    if (profile || !el('instruments').hidden) timer.begin(frames % 12 === 0);
    info = portals.draw(getWorld(player.id), camera, getWorld, now / 1000, { depth, budget });
    timer.end();
    frames++;
    peakDepth = Math.max(peakDepth, info.depth);
    accum += ms;
    if (frames % 30 === 0) {
      dtSample = accum / 30;
      accum = 0;
      if (adaptive && now - sinceQuality > 1800 && frames > 75) {
        const next =
          avg > 21 ? Math.max(0.62, scale - 0.1) : avg < 15.4 ? Math.min(1, scale + 0.05) : scale;
        if (next !== scale) {
          scale = next;
          resize();
          sinceQuality = now;
        }
      }
    }
    if (now - lastUi > 120) {
      ui(now);
      lastUi = now;
    }
    window.threshold.ready = true;
  });
}
start().catch((error) => {
  console.error(error);
  el('failure').hidden = false;
  el('failure').textContent =
    'The atlas could not start. Open it in a WebGL 2 browser with hardware acceleration enabled.';
});
