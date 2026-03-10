import { useEffect, useRef } from 'react';
import { PANEL_PORT_PREFIX } from '../shared/constants';
import type { PanelPortMessage, TabState } from '../shared/types';
import { isContextInvalidationError, isExtensionContextAlive } from '../shared/utils';

// Manages the long-lived port connection to the background service worker.
// Reconnects automatically if the port drops (service worker restart, etc.).
// Calls onTabState whenever the background pushes a state update.
// Calls onInvalidated when the extension context is no longer valid.
export function useBackgroundPort(
  tabId: number,
  disabled: boolean,
  onTabState: (state: TabState) => void,
  onInvalidated: () => void
): void {
  // Store callbacks in refs so they never need to be in the effect's dependency
  // array — the effect only re-runs when tabId or disabled changes.
  const onTabStateRef = useRef(onTabState);
  onTabStateRef.current = onTabState;
  const onInvalidatedRef = useRef(onInvalidated);
  onInvalidatedRef.current = onInvalidated;

  useEffect(() => {
    if (disabled) {
      return;
    }

    if (!isExtensionContextAlive()) {
      onInvalidatedRef.current();
      return;
    }

    let unmounted = false;
    let reconnectTimer: number | null = null;

    function connect() {
      if (unmounted || !isExtensionContextAlive()) {
        onInvalidatedRef.current();
        return;
      }

      let port: chrome.runtime.Port;
      try {
        port = chrome.runtime.connect({ name: `${PANEL_PORT_PREFIX}${tabId}` });
      } catch (error) {
        if (isContextInvalidationError(error)) {
          onInvalidatedRef.current();
          return;
        }
        throw error;
      }

      port.onMessage.addListener((message: PanelPortMessage) => {
        if (!unmounted && message.type === 'TAB_STATE') {
          onTabStateRef.current(message.state);
        }
      });

      port.onDisconnect.addListener(() => {
        if (unmounted) return;

        if (!isExtensionContextAlive()) {
          onInvalidatedRef.current();
          return;
        }

        // The service worker can restart unexpectedly. Reconnect after a brief delay.
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
          void chrome.runtime.sendMessage({ type: 'INIT_TAB', tabId }).catch(() => undefined);
        }, 500);
      });
    }

    connect();
    void chrome.runtime.sendMessage({ type: 'INIT_TAB', tabId }).catch(() => undefined);

    return () => {
      unmounted = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [tabId, disabled]);
}
