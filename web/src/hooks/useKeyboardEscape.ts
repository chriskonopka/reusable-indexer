import { useEffect } from 'react';

// Calls onEscape when the user presses Escape while `active` is true.
// Listener attaches to document so it fires regardless of which element
// has focus — needed for both modals and the upload-progress panel
// (spec 5.4).

export const useKeyboardEscape = (
  active: boolean,
  onEscape: () => void,
): void => {
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, onEscape]);
};
