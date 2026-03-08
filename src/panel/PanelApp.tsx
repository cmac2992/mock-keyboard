import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_KEYBOARD_STATE, KEYBOARD_PRESET_LABELS, PANEL_PORT_PREFIX } from '../shared/constants';
import type {
  KeyboardDebugSnapshot,
  KeyboardPreset,
  PanelPortMessage,
  PanelToBackgroundMessage,
  TabState,
  VisibilityMode
} from '../shared/types';

const VISIBILITY_OPTIONS: VisibilityMode[] = ['auto', 'force-open', 'force-closed'];

export function PanelApp() {
  const tabId = useMemo(() => resolveTabId(), []);
  const [tabState, setTabState] = useState<TabState>(() => ({
    tabId,
    keyboard: { ...DEFAULT_KEYBOARD_STATE }
  }));
  const [debugSnapshot, setDebugSnapshot] = useState<KeyboardDebugSnapshot | null>(null);
  const [advancedDebugOpen, setAdvancedDebugOpen] = useState(false);
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

  // The port gives us push updates from the service worker. We reconnect because
  // MV3 workers sleep aggressively when idle.
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

  // Debug polling is intentionally opt-in. The snapshot is only useful while the
  // section is open, and polling continuously would be wasted work.
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

  const keyboard = tabState.keyboard;
  const controlsDisabled = keyboard.unsupportedReason !== null;
  const statusText = `${keyboard.enabled ? 'Enabled' : 'Disabled'} / ${
    keyboard.visible ? 'Visible' : 'Hidden'
  }`;
  const noticeText = panelInvalidated
    ? 'Extension reloaded. Close and reopen the Mock Keyboard panel.'
    : keyboard.unsupportedReason;

  const updateKeyboardLocally = useCallback((partial: Partial<TabState['keyboard']>) => {
    setTabState((current) => ({
      ...current,
      keyboard: {
        ...current.keyboard,
        ...partial
      }
    }));
  }, []);

  const handleToggleEnabled = async (enabled: boolean) => {
    updateKeyboardLocally({
      enabled,
      visible: enabled ? tabState.keyboard.visible : false,
      heightPx: enabled ? tabState.keyboard.heightPx : 0,
      activeSelector: enabled ? tabState.keyboard.activeSelector : null,
      shiftedElementCount: enabled ? tabState.keyboard.shiftedElementCount : 0,
      unsupportedReason: null
    });
    await sendCommand({ type: 'SET_ENABLED', tabId, enabled });
  };

  const handleToggleDebug = async (debug: boolean) => {
    updateKeyboardLocally({ debug });
    await sendCommand({ type: 'SET_DEBUG', tabId, debug });
  };

  const handleVisibilityChange = async (visibilityMode: VisibilityMode) => {
    updateKeyboardLocally({ visibilityMode });
    await sendCommand({ type: 'SET_VISIBILITY_MODE', tabId, visibilityMode });
  };

  const handlePresetChange = async (preset: KeyboardPreset) => {
    updateKeyboardLocally({ preset });
    await sendCommand({ type: 'SET_PRESET', tabId, preset });
  };

  const handleFallbackToggle = async (checked: boolean) => {
    updateKeyboardLocally({ preferNativeViewport: !checked });
    await sendCommand({
      type: 'SET_PREFER_NATIVE_VIEWPORT',
      tabId,
      preferNativeViewport: !checked
    });
  };

  const handleRefreshDebug = async () => {
    const snapshot = await fetchDebugSnapshot();
    startTransition(() => {
      setDebugSnapshot(snapshot);
    });
  };

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Mock Keyboard controls">
        <div className="toolbar-group">
          <span className="toolbar-title">Mock Keyboard</span>
        </div>
        <div className="toolbar-group toolbar-group--end">
          <label className="checkbox-item checkbox-item--toolbar">
            <input
              id="enabled"
              checked={keyboard.enabled}
              disabled={controlsDisabled || panelInvalidated}
              onChange={(event) => {
                void handleToggleEnabled(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <span>Enabled</span>
          </label>
        </div>
      </div>

      <main className="panel" aria-label="Mock Keyboard panel">
        <section aria-labelledby="controls-heading">
          <h2 id="controls-heading" className="section-header">
            Controls
          </h2>

          <div className="row">
            <label className="row-label" htmlFor="visibilityMode">
              Visibility
            </label>
            <select
              id="visibilityMode"
              disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
              onChange={(event) => {
                void handleVisibilityChange(event.currentTarget.value as VisibilityMode);
              }}
              value={keyboard.visibilityMode}
            >
              {VISIBILITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <label className="row-label" htmlFor="preset">
              Preset
            </label>
            <select
              id="preset"
              disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
              onChange={(event) => {
                void handlePresetChange(event.currentTarget.value as KeyboardPreset);
              }}
              value={keyboard.preset}
            >
              {Object.entries(KEYBOARD_PRESET_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <span className="row-label">Debug</span>
            <label className="checkbox-item">
              <input
                id="debug"
                checked={keyboard.debug}
                disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
                onChange={(event) => {
                  void handleToggleDebug(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              <span>Debug overlays</span>
            </label>
          </div>
        </section>

        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="section-header">
            Status
          </h2>

          <InfoRow label="State">
            <strong id="status" className="row-value">
              {statusText}
            </strong>
          </InfoRow>

          <InfoRow label="Target">
            <strong id="activeSelector" className="row-value row-value--code">
              {keyboard.activeSelector ?? 'None'}
            </strong>
          </InfoRow>

          <InfoRow label="Height">
            <strong id="heightPx" className="row-value">
              {keyboard.heightPx}px
            </strong>
          </InfoRow>

          <InfoRow label="Shifted">
            <strong id="shifted" className="row-value">
              {keyboard.shiftedElementCount}
            </strong>
          </InfoRow>
        </section>

        <section aria-labelledby="advanced-debug-heading">
          <details
            className="details-section"
            id="advancedDebug"
            onToggle={(event) => {
              setAdvancedDebugOpen((event.currentTarget as HTMLDetailsElement).open);
            }}
            open={advancedDebugOpen}
          >
            <summary className="details-summary" id="advanced-debug-heading">
              Advanced Debugging
            </summary>

            <div className="row">
              <span className="row-label">Behavior</span>
              <label className="checkbox-item">
                <input
                  checked={!keyboard.preferNativeViewport}
                  disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
                  id="enableLayoutFallbacks"
                  onChange={(event) => {
                    void handleFallbackToggle(event.currentTarget.checked);
                  }}
                  type="checkbox"
                />
                <span>Enable layout fallbacks</span>
              </label>
            </div>

            <InfoRow label="Bridge">
              <strong id="debugBridge" className="row-value">
                {formatBridgeSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Last Event">
              <strong id="debugEvent" className="row-value row-value--code">
                {formatEventSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Viewport">
              <strong id="debugViewport" className="row-value row-value--code">
                {formatViewportSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Shim">
              <strong id="debugShim" className="row-value row-value--code">
                {formatShimSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Fallbacks">
              <strong id="debugFallback" className="row-value row-value--code">
                {formatFallbackSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <div className="debug-actions">
              <button
                disabled={panelInvalidated || !keyboard.enabled}
                id="debugRefresh"
                onClick={() => {
                  void handleRefreshDebug();
                }}
                type="button"
              >
                Refresh
              </button>
            </div>

            <pre id="debugSnapshot" className="debug-pre">
              {formatDebugSnapshot(debugSnapshot, keyboard.enabled, keyboard.preferNativeViewport)}
            </pre>
          </details>
        </section>
      </main>

      {noticeText ? (
        <p className="notice" id="notice">
          {noticeText}
        </p>
      ) : (
        <p className="notice" hidden id="notice" />
      )}
    </>
  );
}

function InfoRow(props: { children: ReactNode; label: string }) {
  return (
    <div className="row">
      <span className="row-label">{props.label}</span>
      {props.children}
    </div>
  );
}

function resolveTabId(): number {
  const queryTabId = Number(new URLSearchParams(window.location.search).get('tabId'));
  if (Number.isInteger(queryTabId) && queryTabId > 0) {
    return queryTabId;
  }

  if (chrome.devtools?.inspectedWindow?.tabId) {
    return chrome.devtools.inspectedWindow.tabId;
  }

  throw new Error('Unable to determine the inspected tab id.');
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

function formatBridgeSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  if (snapshot.bridgeReady) {
    return snapshot.pendingBridgeEvent ? 'Ready / pending event' : 'Ready';
  }

  return snapshot.bridgeInjected ? 'Injected / waiting' : 'Not injected';
}

function formatEventSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'None';
  }

  return snapshot.lastChange
    ? `${snapshot.lastChange.source} (${snapshot.lastChange.heightPx}px)`
    : 'None';
}

function formatViewportSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  const viewport = snapshot.contentViewport;
  return `${Math.round(viewport.width)} x ${Math.round(viewport.height)} @ ${Math.round(
    viewport.offsetTop
  )},${Math.round(viewport.offsetLeft)}`;
}

function formatShimSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  if (!snapshot.page) {
    return 'No page shim data';
  }

  return `${snapshot.page.shim.windowPatched ? 'window' : 'window off'} / ${
    snapshot.page.shim.visualViewportPatched ? 'visualViewport' : 'visualViewport off'
  } / ${snapshot.page.eventCount} events`;
}

function formatFallbackSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  if (snapshot.preferNativeViewport) {
    return 'Native viewport';
  }

  const states = [];
  states.push(snapshot.fallback.bodyPaddingApplied ? 'padding on' : 'padding off');
  states.push(snapshot.fallback.shiftedElementsApplied ? 'shift on' : 'shift off');
  states.push(snapshot.fallback.autoScrollApplied ? 'scroll on' : 'scroll off');
  states.push(`overlap ${snapshot.fallback.focusedOverlapPx}px`);
  return states.join(' / ');
}

function formatDebugSnapshot(
  snapshot: KeyboardDebugSnapshot | null,
  keyboardEnabled: boolean,
  preferNativeViewport: boolean
): string {
  if (!keyboardEnabled) {
    return 'Simulator disabled for this tab.';
  }

  if (!snapshot) {
    return 'Open this section to inspect viewport shim state.';
  }

  const lines = [
    'Controller',
    `  preferNativeViewport: ${snapshot.preferNativeViewport}`,
    `  visible: ${snapshot.visible}`,
    `  heightPx: ${snapshot.heightPx}`,
    `  preset: ${snapshot.preset}`,
    `  visibilityMode: ${snapshot.visibilityMode}`,
    `  activeSelector: ${snapshot.activeSelector ?? 'None'}`,
    `  shiftedElementCount: ${snapshot.shiftedElementCount}`,
    `  keyboardOffsetFormulaPx: ${snapshot.keyboardOffsetFormulaPx}`,
    `  contentViewport: ${Math.round(snapshot.contentViewport.width)} x ${Math.round(
      snapshot.contentViewport.height
    )} @ ${Math.round(snapshot.contentViewport.offsetTop)},${Math.round(
      snapshot.contentViewport.offsetLeft
    )}`,
    `  contentInner: ${snapshot.contentInnerWidth} x ${snapshot.contentInnerHeight}`,
    'Fallback',
    `  scheduled: ${snapshot.fallback.scheduled}`,
    `  bodyPaddingApplied: ${snapshot.fallback.bodyPaddingApplied}`,
    `  shiftedElementsApplied: ${snapshot.fallback.shiftedElementsApplied}`,
    `  autoScrollApplied: ${snapshot.fallback.autoScrollApplied}`,
    `  focusedOverlapPx: ${snapshot.fallback.focusedOverlapPx}`,
    `  focusedAnchored: ${snapshot.fallback.focusedAnchored}`
  ];

  if (snapshot.lastChange) {
    lines.push('Last change');
    lines.push(`  source: ${snapshot.lastChange.source}`);
    lines.push(`  visible: ${snapshot.lastChange.visible}`);
    lines.push(`  heightPx: ${snapshot.lastChange.heightPx}`);
  }

  if (snapshot.page) {
    lines.push('Page shim');
    lines.push(`  eventCount: ${snapshot.page.eventCount}`);
    lines.push(`  keyboardOffsetFormulaPx: ${snapshot.page.keyboardOffsetFormulaPx}`);
    lines.push(`  windowPatched: ${snapshot.page.shim.windowPatched}`);
    lines.push(`  visualViewportPatched: ${snapshot.page.shim.visualViewportPatched}`);
    lines.push(
      `  observed.inner: ${snapshot.page.observed.innerWidth} x ${snapshot.page.observed.innerHeight}`
    );
    lines.push(
      `  observed.visualViewport: ${snapshot.page.observed.visualViewportWidth ?? 'null'} x ${
        snapshot.page.observed.visualViewportHeight ?? 'null'
      } @ ${snapshot.page.observed.visualViewportOffsetTop ?? 'null'},${
        snapshot.page.observed.visualViewportOffsetLeft ?? 'null'
      }`
    );
  } else {
    lines.push('Page shim');
    lines.push(
      preferNativeViewport
        ? '  Waiting for a page-context snapshot.'
        : '  No page-context debug snapshot available yet.'
    );
  }

  return lines.join('\n');
}
