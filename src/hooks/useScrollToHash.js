import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// After navigating to `/path#some-id` (e.g. from the Ctrl+K search), scroll the
// matching element into view and briefly highlight it. The target often mounts a
// beat after navigation — a route transition, a Settings tab switch, or a data
// fetch — so we poll for it for a short window before giving up quietly.
export function useScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer;

    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('search-target-flash');
        setTimeout(() => el.classList.remove('search-target-flash'), 1600);
        return;
      }
      // Retry for ~2s (20 × 100ms) to let a late-mounting target appear.
      if (tries++ < 20) timer = setTimeout(tryScroll, 100);
    };

    tryScroll();
    return () => clearTimeout(timer);
  }, [pathname, hash]);
}

export default useScrollToHash;
