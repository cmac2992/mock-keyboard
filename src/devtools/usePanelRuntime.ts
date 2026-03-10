import { startTransition, useCallback, useEffect, useState } from 'react';
import { DEFAULT_KEYBOARD_STATE } from '../shared/constants';
import type {
  KeyboardDebugSnapshot,
  KeyboardPreset,
  PanelToBackgroundMessage,
  TabState,
  VisibilityMode
} from '../shared/types';
import { isContextInvalidationError, isExtensionContextAlive } from '../shared/utils';
import { useBackgroundPort } from './useBackgroundPort';

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

  const markPanelInvalidated = useCallback(() => {
    setPanelInvalidated(true);
  }, []);

  // Connect to the background service worker and keep state in sync.
  // Disabled when we have no valid tab ID or the panel context has been invalidated.
  useBackgroundPort(tabId, tabId <= 0 || panelInvalidated, setTabState, markPanelInvalidated);

  // Send a command to the background and update local state with the response.
  const sendCommand = useCallback(
    async (message: PanelToBackgroundMessage): Promise<void> => {
      if (panelInvalidated || !isExtensionContextAlive()) {
        markPanelInvalidated();
        return;
      }

      try {
        const response = (await chrome.runtime.sendMessage(message)) as TabState | undefined;
        if (response) {
          setTabState(response);
        }
      } catch (error) {
        if (isContextInvalidationError(error)) {
          markPanelInvalidated();
        } else {
          throw error;
        }
      }
    },
    [markPanelInvalidated, panelInvalidated]
  );

  // Fetch the debug snapshot from the background on demand.
  const fetchSnapshot = useCallback(async (): Promise<KeyboardDebugSnapshot | null> => {
    if (panelInvalidated || !isExtensionContextAlive()) {
      markPanelInvalidated();
      return null;
    }

    try {
      return ((await chrome.runtime.sendMessage({
        type: 'GET_DEBUG_SNAPSHOT',
        tabId
      } satisfies PanelToBackgroundMessage)) ?? null) as KeyboardDebugSnapshot | null;
    } catch (error) {
      if (isContextInvalidationError(error)) {
        markPanelInvalidated();
        return null;
      }
      throw error;
    }
  }, [markPanelInvalidated, panelInvalidated, tabId]);

  // Auto-refresh the debug snapshot while the advanced panel is open.
  useEffect(() => {
    if (tabId <= 0 || !advancedDebugOpen || panelInvalidated) {
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      const snapshot = await fetchSnapshot();
      if (!cancelled) {
        startTransition(() => setDebugSnapshot(snapshot));
      }
    };

    void refresh();
    const timerId = window.setInterval(() => void refresh(), 500);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [advancedDebugOpen, fetchSnapshot, panelInvalidated, tabId]);

  // Optimistic update helpers: each updates local state immediately for a
  // responsive feel, then sends the command to the background for the real update.
  const updateKeyboardLocally = useCallback((patch: Partial<TabState['keyboard']>) => {
    setTabState((current) => ({
      ...current,
      keyboard: { ...current.keyboard, ...patch }
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
    const snapshot = await fetchSnapshot();
    startTransition(() => setDebugSnapshot(snapshot));
  }, [fetchSnapshot]);

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
