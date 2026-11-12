// dom.js: a very small keyed renderer. Views describe the stage as a list of
// nodes; elements with the same key persist between renders, so a tile that
// changes position slides there under a CSS transition instead of jumping.
(() => {
  const SVG = new Set('svg g rect circle line path text tspan polygon polyline ellipse defs'.split(' '));
  const NS = 'http://www.w3.org/2000/svg';

  BB.h = (tag, props, ...kids) => ({ tag, props: props || {}, kids: kids.flat(Infinity).filter((k) => k && typeof k === 'object') });

  const setProps = (el, props) => {
    const old = el._p || {};
    for (const k in old) {
      if (k in props) continue;
      if (k === 'style') el.removeAttribute('style');
      else if (k.startsWith('on')) el[k] = null;
      else if (k !== 'key' && k !== 'text') el.removeAttribute(k);
    }
    for (const k in props) {
      const v = props[k];
      if (k === 'key' || k === 'text') continue;
      if (k === 'style') {
        const os = old.style || {};
        for (const sk in os) if (!(sk in v)) el.style.removeProperty(sk);
        for (const sk in v) if (os[sk] !== v[sk]) el.style.setProperty(sk, v[sk]);
      } else if (k.startsWith('on')) el[k] = v || null;
      else if (old[k] !== v) { if (v == null || v === false) el.removeAttribute(k); else el.setAttribute(k, v === true ? '' : v); }
    }
    el._p = props;
  };

  BB.patch = (parent, kids) => {
    const have = new Map();
    for (const ch of parent.childNodes) if (ch._key != null && !ch._gone) have.set(ch._key, ch);
    let prev = null;
    kids.forEach((v, i) => {
      const key = v.props.key != null ? v.props.key : '#' + i + v.tag;
      let el = have.get(key);
      if (el && el.tagName.toLowerCase() !== v.tag.toLowerCase()) el = null;
      if (el) have.delete(key);
      else {
        el = SVG.has(v.tag) ? document.createElementNS(NS, v.tag) : document.createElement(v.tag);
        el._key = key;
        if (!BB.still) { el.setAttribute('data-new', ''); setTimeout(() => el.removeAttribute('data-new'), 450); }
      }
      setProps(el, v.props);
      if ('text' in v.props) { const t = String(v.props.text); if (el.textContent !== t) el.textContent = t; } else BB.patch(el, v.kids);
      let want = prev ? prev.nextSibling : parent.firstChild;
      while (want && want._gone) want = want.nextSibling;
      if (el !== want) parent.insertBefore(el, want);
      prev = el;
    });
    for (const el of have.values()) {
      if (BB.still) { el.remove(); continue; }
      el._gone = true; el.setAttribute('data-gone', ''); el.onclick = null;
      setTimeout(() => el.remove(), 320);
    }
  };

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  BB.esc = esc;
  // **bold**, _emphasis_ and `code` in lesson text.
  BB.fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/(^|[\s(])_(.+?)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
  const KW = /\b(def|class|for|in|while|if|elif|else|return|not|and|or|is|None|True|False|break)\b/g;
  BB.code = (lines, hot) => '<pre class="code">' + lines.map((ln, i) => {
    const cut = ln.indexOf('#');
    const body = cut < 0 ? ln : ln.slice(0, cut), note = cut < 0 ? '' : ln.slice(cut);
    return `<span class="ln${hot === i + 1 ? ' hot' : ''}" data-ln="${i + 1}">${esc(body).replace(KW, '<i>$1</i>')}${note ? `<u>${esc(note)}</u>` : ''}\n</span>`;
  }).join('') + '</pre>';
})();
