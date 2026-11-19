import { describe, field } from './atlas.js';
export const el = (id) => document.getElementById(id);
export const address = (id) => {
  const s = BigInt(id).toString(36).toUpperCase();
  return s.length > 12 ? s.slice(0, 4) + '…' + s.slice(-6) : s.padStart(4, '0');
};
const directions = [
  'North',
  'North-east',
  'East',
  'South-east',
  'South',
  'South-west',
  'West',
  'North-west',
];
export function bearing(yaw) {
  const degrees = ((Math.round((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  el('degrees').textContent = String(degrees).padStart(3, '0') + '°';
  el('direction').textContent = directions[Math.round(degrees / 45) % 8];
  document.querySelector('.hand').style.transform = 'rotate(' + -degrees + 'deg)';
}
export function label(world) {
  el('cover-place').textContent = world.title;
  el('place').textContent = world.title;
  el('habitat').textContent = field[world.biome][1] + '  /  ' + address(world.id);
}
let toastTimer;
export function notify(message) {
  el('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el('toast').textContent = ''), 3100);
}
function element(tag, text, cls) {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
export async function journalPage(book, page, current, recall) {
  const [total, records] = await Promise.all([book.count(), book.page(page * 6, 6)]);
  el('journal-count').textContent = total + ' ' + (total === 1 ? 'world' : 'worlds') + ' entered';
  const rows = records.map((r) => {
    const w = describe(r.id),
      f = field[w.biome],
      n = element('article', '', 'entry');
    n.append(element('small', address(r.id) + '   /   ' + f[1]), element('h3', w.title));
    if (r.tuned) n.append(element('p', f[3] + ' sounded. ' + f[2]));
    const routes = Object.entries(r.links).map(([key, id]) =>
      id === r.id ? 'Returning aisle' : describe(id).title
    );
    n.append(
      element(
        'p',
        routes.length ? 'Passages · ' + [...new Set(routes)].join(' / ') : 'First mooring',
        'links'
      )
    );
    if (r.id === current) n.append(element('small', 'Current location'));
    else {
      const btn = element('button', 'Recall this mooring →');
      btn.onclick = () => recall(r.id);
      n.append(btn);
    }
    return n;
  });
  el('entries').replaceChildren(...rows);
  el('prev').disabled = page === 0;
  el('next').disabled = (page + 1) * 6 >= total;
}
