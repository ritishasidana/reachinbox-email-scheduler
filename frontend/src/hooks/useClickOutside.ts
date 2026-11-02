import { useEffect, type RefObject } from 'react';

/** Calls `onOutside` on mousedown outside the element or on Escape. */
export function useClickOutside(ref: RefObject<HTMLElement>, onOutside: () => void, active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOutside();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, active]);
}
