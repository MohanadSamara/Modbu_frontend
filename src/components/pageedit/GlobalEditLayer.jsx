// ============================================================================
// GlobalEditLayer — makes EVERY element on a page restyleable, not just the
// hand-wrapped <Editable> ones.
//
// Two jobs:
//   1. Always (for every user): inject a <style> tag built from the saved
//      global overrides, so an admin's re-skin shows for everyone. Because it's
//      real CSS keyed by a per-route structural selector, it survives React
//      re-renders (unlike mutating element.style directly).
//   2. In Edit Mode (admins): let the admin click any element to select it for
//      the inspector, and highlight whatever's under the cursor.
//
// It renders nothing. Mount it once inside <Layout>, next to the <main
// data-pe-root> it scopes to.
// ============================================================================

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageEdit } from '../../context/PageEditContext.jsx';
import { elementAutoId, buildGlobalCss } from '../../context/pageEditDom.js';

export default function GlobalEditLayer() {
  const { isAdmin, editMode, overrides, selectedId, setSelectedId } = usePageEdit();
  const { pathname } = useLocation();
  const editing = isAdmin && editMode;

  // ── 1. Keep the injected stylesheet in sync (runs for everyone) ───────────
  useEffect(() => {
    let tag = document.getElementById('pe-global-style');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'pe-global-style';
      document.head.appendChild(tag);
    }
    tag.textContent = buildGlobalCss(overrides, { editMode: editing, selectedId });
  }, [overrides, editing, selectedId, pathname]);

  // ── 2. Edit-mode interaction: click to select, hover to highlight ─────────
  useEffect(() => {
    if (!editing) {
      document.body.classList.remove('pe-editing');
      return undefined;
    }
    document.body.classList.add('pe-editing');

    const insideRoot = (node) => {
      const root = document.querySelector('[data-pe-root]');
      return root && root.contains(node) ? root : null;
    };

    const onClick = (e) => {
      const root = insideRoot(e.target);
      if (!root) return;                          // toolbar / inspector / sidebar
      if (e.target.closest('.pe-editable')) return; // let <Editable> own its click
      e.preventDefault();
      e.stopPropagation();
      const id = elementAutoId(e.target, root, pathname);
      if (id) setSelectedId(id);
    };

    let hovered = null;
    const clearHover = () => {
      if (hovered) { hovered.removeAttribute('data-pe-hover'); hovered = null; }
    };
    const onMove = (e) => {
      const root = insideRoot(e.target);
      if (!root || e.target === root || e.target.closest('.pe-editable')) {
        clearHover();
        return;
      }
      if (hovered !== e.target) {
        clearHover();
        e.target.setAttribute('data-pe-hover', '');
        hovered = e.target;
      }
    };

    // Capture phase so we intercept before the element's own handlers (nav, etc.).
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousemove', onMove, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousemove', onMove, true);
      clearHover();
      document.body.classList.remove('pe-editing');
    };
  }, [editing, pathname, setSelectedId]);

  return null;
}
