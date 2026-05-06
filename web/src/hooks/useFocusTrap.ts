import { RefObject, useEffect } from 'react';

// Traps Tab/Shift+Tab inside the referenced container while `active` is true.
// Returns focus to the element that was focused before the trap engaged, on
// teardown. Used by the Modal primitive per web-accessibility.md.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const collectFocusable = (container: HTMLElement): HTMLElement[] => {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter(
    (el) =>
      !el.hasAttribute('inert') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.closest('[aria-hidden="true"]'),
  );
};

export const useFocusTrap = (
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void => {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = collectFocusable(container);
    const initial = focusable[0] ?? container;
    initial.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const current = collectFocusable(container);
      if (current.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = current[0];
      const last = current[current.length - 1];
      const active2 = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active2 === first || !container.contains(active2)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active2 === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
};
