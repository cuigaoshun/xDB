import { useEffect, useRef } from 'react';

interface KeyboardShortcutOptions {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /**
   * Automatically handles Ctrl on Windows/Linux and Cmd on Mac
   */
  mod?: boolean;
  preventDefault?: boolean;
  enabled?: boolean;
}

/**
 * A hook for listening to keyboard shortcuts globally.
 * 
 * @param key The key to listen for (e.g., 'w', 'Enter', 'Escape')
 * @param callback The function to call when the shortcut is triggered
 * @param options Shortcut configuration options
 */
export function useKeyboardShortcut(
  key: string,
  callback: (e: KeyboardEvent) => void,
  options: KeyboardShortcutOptions = {}
) {
  const {
    ctrl,
    meta,
    shift,
    alt,
    mod,
    preventDefault = true,
    enabled = true
  } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMatch = e.key.toLowerCase() === key.toLowerCase();
      
      // We use strict matching: if a modifier is not requested, it must be false.
      // 'mod' is a helper that maps to Meta on Mac and Ctrl on Win/Linux.
      const effectiveCtrl = ctrl !== undefined ? ctrl : (mod !== undefined && !isMac ? mod : false);
      const effectiveMeta = meta !== undefined ? meta : (mod !== undefined && isMac ? mod : false);
      const effectiveShift = shift !== undefined ? shift : false;
      const effectiveAlt = alt !== undefined ? alt : false;

      if (
        keyMatch &&
        e.ctrlKey === effectiveCtrl &&
        e.metaKey === effectiveMeta &&
        e.shiftKey === effectiveShift &&
        e.altKey === effectiveAlt
      ) {
        if (preventDefault) {
          e.preventDefault();
        }
        callbackRef.current(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: preventDefault });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: preventDefault });
  }, [key, ctrl, meta, shift, alt, mod, preventDefault, enabled]);
}
