// ============================================================================
// pageEditDom.js — helpers for the GLOBAL element editor (restyle anything).
//
// The wrapped <Editable id="…"> system keys overrides by a hand-written id.
// The global editor additionally lets an admin click ANY element and restyle
// it. Those elements have no hand-written id, so we synthesise a STABLE one
// from the element's structural position (a chain of `tag:nth-of-type`) inside
// the routed page, scoped by the route pathname:
//
//   @el:/projects||div:2>section:1>h2:1
//
// That id round-trips to a pure CSS selector, so saved styles are applied as an
// injected stylesheet — which survives React re-renders (unlike mutating the
// DOM directly) and shows for every user, not just the editing admin.
// ============================================================================

export const AUTO_PREFIX = '@el:';

// Is this override id a synthesised (global-editor) one vs. a wrapped <Editable>?
export function isAutoId(id) {
  return typeof id === 'string' && id.startsWith(AUTO_PREFIX);
}

// Walk from `el` up to (but excluding) `rootEl`, recording each node's tag and
// its 1-based index among same-tag siblings (== CSS :nth-of-type). Returns null
// if `el` isn't inside `rootEl`.
function pathSegments(el, rootEl) {
  const segs = [];
  let node = el;
  while (node && node !== rootEl && node.nodeType === 1) {
    const tag = node.tagName.toLowerCase();
    let idx = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.tagName === node.tagName) idx += 1;
      sib = sib.previousElementSibling;
    }
    segs.unshift({ tag, idx });
    node = node.parentElement;
  }
  if (node !== rootEl) return null; // el wasn't under root
  return segs;
}

// Synthesise the stable auto-id for a clicked element (or null if not editable).
export function elementAutoId(el, rootEl, route) {
  if (!el || !rootEl) return null;
  const segs = pathSegments(el, rootEl);
  if (!segs || segs.length === 0) return null;
  const pathStr = segs.map((s) => `${s.tag}:${s.idx}`).join('>');
  return `${AUTO_PREFIX}${route}||${pathStr}`;
}

// Split an auto-id back into its route + structural-path parts.
export function parseAutoId(id) {
  if (!isAutoId(id)) return null;
  const body = id.slice(AUTO_PREFIX.length);
  const i = body.indexOf('||');
  if (i === -1) return null;
  return { route: body.slice(0, i), pathStr: body.slice(i + 2) };
}

function escapeAttrValue(v) {
  return String(v).replace(/["\\]/g, '\\$&');
}

// Turn an auto-id into the CSS selector that targets its element. The root is
// the routed <main data-pe-root data-pe-route="…">, so styles only apply on the
// page they were made on.
export function autoIdToSelector(id) {
  const p = parseAutoId(id);
  if (!p) return null;
  const root = `[data-pe-root][data-pe-route="${escapeAttrValue(p.route)}"]`;
  const chain = p.pathStr
    .split('>')
    .map((seg) => {
      const [tag, idx] = seg.split(':');
      return `${tag}:nth-of-type(${idx})`;
    })
    .join(' > ');
  return `${root} > ${chain}`;
}

// A short human label for the inspector header (e.g. "h2 · Projects").
export function autoIdLabel(id) {
  const p = parseAutoId(id);
  if (!p) return id;
  const last = p.pathStr.split('>').pop() || '';
  const tag = last.split(':')[0] || 'element';
  return `${tag} · ${p.route}`;
}

// Serialise a camelCase inline-style object to a `!important` CSS declaration
// string. !important ensures the override beats the element's Tailwind classes.
export function styleToCss(style = {}) {
  const decls = [];
  for (const [k, v] of Object.entries(style)) {
    if (v == null || v === '') continue;
    const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    decls.push(`${prop}: ${v} !important`);
  }
  return decls.join('; ');
}

// Build the full stylesheet text from every auto-override. In edit mode a hidden
// element is dimmed (so the admin can still select/unhide it) instead of removed,
// and the currently selected element gets an outline.
export function buildGlobalCss(overrides, { editMode = false, selectedId = null } = {}) {
  let css = '';
  for (const [id, ov] of Object.entries(overrides || {})) {
    if (!isAutoId(id)) continue;
    const sel = autoIdToSelector(id);
    if (!sel) continue;
    const decls = styleToCss(ov.style || {});
    if (decls) css += `${sel}{${decls}}\n`;
    if (ov.hidden) {
      css += editMode
        ? `${sel}{opacity:.4 !important}\n`
        : `${sel}{display:none !important}\n`;
    }
  }
  if (editMode && isAutoId(selectedId)) {
    const sel = autoIdToSelector(selectedId);
    if (sel) css += `${sel}{outline:2px solid #3b82f6 !important;outline-offset:1px}\n`;
  }
  return css;
}
