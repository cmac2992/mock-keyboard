import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_KEYBOARD_STATE, PANEL_PORT_PREFIX } from '../shared/constants';
import type {
  KeyboardDebugSnapshot,
  KeyboardPreset,
  PanelPortMessage,
  PanelToBackgroundMessage,
  TabState,
  VisibilityMode
} from '../shared/types';

interface PanelRuntime {
  tabState: TabState;
  debugSnapshot: KeyboardDebugSnapshot | null;
  panelInvalidated: boolean;
  sendEnabled(enabled: boolean): Promise<void>;
  sendDebug(debug: boolean): Promise<void>;
  sendVisibilityMode(visibilityMode: VisibilityMode): Promise<void>;
  sendPreset(preset: KeyboardPreset): Promise<void>;
  refreshDebugSnapshot(): Promise<void>;
}

export function usePanelRuntime(tabId: number, advancedDebugOpen: boolean): PanelRuntime {
  const [tabState, setTabState] = useState<TabState>(() => ({
    tabId,
    keyboard: { ...DEFAULT_KEYBOARD_STATE }
  }));
  const [debugSnapshot, setDebugSnapshot] = useState<KeyboardDebugSnapshot | null>(null);
  const [panelInvalidated, setPanelInvalidated] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);

  const markPanelInvalidated = useCallback(() => {
    setPanelInvalidated((current) => {
      if (current) {
        return current;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      return true;
    });
  }, []);

  const sendCommand = useCallback(
    async (message: PanelToBackgroundMessage): Promise<TabState | null> => {
      if (panelInvalidated || !isExtensionContextAlive()) {
        markPanelInvalidated();
        return null;
      }

      try {
        const response = (await chrome.runtime.sendMessage(message)) as TabState | undefined;
        if (response) {
          setTabState(response);
          return response;
        }

        return null;
      } catch (error) {
        if (isContextInvalidationError(error)) {
          markPanelInvalidated();
          return null;
        }

        throw error;
      }
    },
    [markPanelInvalidated, panelInvalidated]
  );

  const fetchDebugSnapshot = useCallback(async (): Promise<KeyboardDebugSnapshot | null> => {
    if (panelInvalidated || !isExtensionContextAlive()) {
      markPanelInvalidated();
      return null;
    }

    try {
      return (await chrome.runtime.sendMessage({
        type: 'GET_DEBUG_SNAPSHOT',
        tabId
      } satisfies PanelToBackgroundMessage)) as KeyboardDebugSnapshot | null;
    } catch (error) {
      if (isContextInvalidationError(error)) {
        markPanelInvalidated();
        return null;
      }

      throw error;
    }
  }, [markPanelInvalidated, panelInvalidated, tabId]);

  useEffect(() => {
    if (panelInvalidated || !isExtensionContextAlive()) {
      markPanelInvalidated();
      return;
    }

    let disposed = false;
    let port: chrome.runtime.Port | null = null;

    const connect = () => {
      if (disposed || panelInvalidated || !isExtensionContextAlive()) {
        markPanelInvalidated();
        return;
      }

      port = chrome.runtime.connect({ name: `${PANEL_PORT_PREFIX}${tabId}` });
      port.onMessage.addListener((message: PanelPortMessage) => {
        if (disposed || message.type !== 'TAB_STATE') {
          return;
        }

        setTabState(message.state);
      });

      port.onDisconnect.addListener(() => {
        if (disposed) {
          return;
        }

        if (!isExtensionContextAlive()) {
          markPanelInvalidated();
          return;
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
          void sendCommand({ type: 'INIT_TAB', tabId });
        }, 500);
      });
    };

    connect();
    void sendCommand({ type: 'INIT_TAB', tabId });

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      port?.disconnect();
    };
  }, [markPanelInvalidated, panelInvalidated, sendCommand, tabId]);

  useEffect(() => {
    if (!advancedDebugOpen || panelInvalidated) {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const refresh = async () => {
      const snapshot = await fetchDebugSnapshot();
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setDebugSnapshot(snapshot);
      });
    };

    void refresh();
    timerId = window.setInterval(() => {
      void refresh();
    }, 500);

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [advancedDebugOpen, fetchDebugSnapshot, panelInvalidated]);

  const updateKeyboardLocally = useCallback((partial: Partial<TabState['keyboard']>) => {
    setTabState((current) => ({
      ...current,
      keyboard: {
        ...current.keyboard,
        ...partial
      }
    }));
  }, []);

  const sendEnabled = useCallback(
    async (enabled: boolean) => {
      updateKeyboardLocally({
        enabled,
        visible: enabled ? tabState.keyboard.visible : false,
        heightPx: enabled ? tabState.keyboard.heightPx : 0,
        activeSelector: enabled ? tabState.keyboard.activeSelector : null,
        unsupportedReason: null
      });
      await sendCommand({ type: 'SET_ENABLED', tabId, enabled });
    },
    [sendCommand, tabId, tabState.keyboard.activeSelector, tabState.keyboard.heightPx, tabState.keyboard.visible, updateKeyboardLocally]
  );

  const sendDebug = useCallback(
    async (debug: boolean) => {
      updateKeyboardLocally({ debug });
      await sendCommand({ type: 'SET_DEBUG', tabId, debug });
    },
    [sendCommand, tabId, updateKeyboardLocally]
  );

  const sendVisibilityMode = useCallback(
    async (visibilityMode: VisibilityMode) => {
      updateKeyboardLocally({ visibilityMode });
      await sendCommand({ type: 'SET_VISIBILITY_MODE', tabId, visibilityMode });
    },
    [sendCommand, tabId, updateKeyboardLocally]
  );

  const sendPreset = useCallback(
    async (preset: KeyboardPreset) => {
      updateKeyboardLocally({ preset });
      await sendCommand({ type: 'SET_PRESET', tabId, preset });
    },
    [sendCommand, tabId, updateKeyboardLocally]
  );

  const refreshDebugSnapshot = useCallback(async () => {
    const snapshot = await fetchDebugSnapshot();
    startTransition(() => {
      setDebugSnapshot(snapshot);
    });
  }, [fetchDebugSnapshot]);

  return {
    tabState,
    debugSnapshot,
    panelInvalidated,
    sendEnabled,
    sendDebug,
    sendVisibilityMode,
    sendPreset,
    refreshDebugSnapshot
  };
}

function isExtensionContextAlive(): boolean {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function isContextInvalidationError(error: unknown): boolean {
  return error instanceof Error && /Extension context invalidated/i.test(error.message);
}
