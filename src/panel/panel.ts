import { DEFAULT_KEYBOARD_STATE, KEYBOARD_PRESET_LABELS, PANEL_PORT_PREFIX } from '../shared/constants';
import type {
  KeyboardDebugSnapshot,
  KeyboardPreset,
  PanelPortMessage,
  PanelToBackgroundMessage,
  TabState,
  VisibilityMode
} from '../shared/types';

const enabledInput = requireElement<HTMLInputElement>('#enabled');
const debugInput = requireElement<HTMLInputElement>('#debug');
const visibilitySelect = requireElement<HTMLSelectElement>('#visibilityMode');
const presetSelect = requireElement<HTMLSelectElement>('#preset');
const statusNode = requireElement<HTMLElement>('#status');
const activeSelectorNode = requireElement<HTMLElement>('#activeSelector');
const heightNode = requireElement<HTMLElement>('#heightPx');
const shiftedNode = requireElement<HTMLElement>('#shifted');
const noticeNode = requireElement<HTMLElement>('#notice');
const advancedDebugNode = requireElement<HTMLDetailsElement>('#advancedDebug');
const enableLayoutFallbacksInput = requireElement<HTMLInputElement>('#enableLayoutFallbacks');
const debugBridgeNode = requireElement<HTMLElement>('#debugBridge');
const debugEventNode = requireElement<HTMLElement>('#debugEvent');
const debugViewportNode = requireElement<HTMLElement>('#debugViewport');
const debugShimNode = requireElement<HTMLElement>('#debugShim');
const debugFallbackNode = requireElement<HTMLElement>('#debugFallback');
const debugSnapshotNode = requireElement<HTMLElement>('#debugSnapshot');
const debugRefreshButton = requireElement<HTMLButtonElement>('#debugRefresh');

const tabId = resolveTabId();
let currentState: TabState = {
  tabId,
  keyboard: { ...DEFAULT_KEYBOARD_STATE }
};
let reconnectTimer: number | null = null;
let debugPollTimer: number | null = null;
let panelInvalidated = false;

for (const value of ['auto', 'force-open', 'force-closed'] as VisibilityMode[]) {
  visibilitySelect.add(new Option(value, value));
}

for (const value of Object.keys(KEYBOARD_PRESET_LABELS) as KeyboardPreset[]) {
  presetSelect.add(new Option(KEYBOARD_PRESET_LABELS[value], value));
}

function connect(): void {
  if (panelInvalidated || !isExtensionContextAlive()) {
    handlePanelInvalidation();
    return;
  }

  const port = chrome.runtime.connect({ name: `${PANEL_PORT_PREFIX}${tabId}` });

  port.onMessage.addListener((message: PanelPortMessage) => {
    if (message.type === 'TAB_STATE') {
      noticeNode.hidden = true;
      currentState = message.state;
      render();
    }
  });

  port.onDisconnect.addListener(() => {
    if (!isExtensionContextAlive()) {
      handlePanelInvalidation();
      return;
    }

    // MV3 service workers terminate after ~30s of inactivity. Reconnect automatically.
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
      void sendCommand({ type: 'INIT_TAB', tabId });
    }, 500);
  });
}

connect();
void sendCommand({ type: 'INIT_TAB', tabId });

enabledInput.addEventListener('change', () => {
  void sendCommand({ type: 'SET_ENABLED', tabId, enabled: enabledInput.checked });
});

debugInput.addEventListener('change', () => {
  void sendCommand({ type: 'SET_DEBUG', tabId, debug: debugInput.checked });
});

visibilitySelect.addEventListener('change', () => {
  void sendCommand({
    type: 'SET_VISIBILITY_MODE',
    tabId,
    visibilityMode: visibilitySelect.value as VisibilityMode
  });
});

presetSelect.addEventListener('change', () => {
  void sendCommand({
    type: 'SET_PRESET',
    tabId,
    preset: presetSelect.value as KeyboardPreset
  });
});

enableLayoutFallbacksInput.addEventListener('change', () => {
  void sendCommand({
    type: 'SET_PREFER_NATIVE_VIEWPORT',
    tabId,
    preferNativeViewport: !enableLayoutFallbacksInput.checked
  });
});

advancedDebugNode.addEventListener('toggle', () => {
  if (advancedDebugNode.open) {
    void refreshDebugSnapshot();
    startDebugPolling();
    return;
  }

  stopDebugPolling();
});

debugRefreshButton.addEventListener('click', () => {
  void refreshDebugSnapshot();
});

render();

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

async function sendCommand(message: PanelToBackgroundMessage): Promise<void> {
  if (panelInvalidated || !isExtensionContextAlive()) {
    handlePanelInvalidation();
    return;
  }

  try {
    const response = (await chrome.runtime.sendMessage(message)) as TabState | undefined;
    if (response) {
      currentState = response;
      render();
    }
  } catch (error) {
    if (isContextInvalidationError(error)) {
      handlePanelInvalidation();
      return;
    }

    throw error;
  }
}

async function fetchDebugSnapshot(): Promise<KeyboardDebugSnapshot | null> {
  if (panelInvalidated || !isExtensionContextAlive()) {
    handlePanelInvalidation();
    return null;
  }

  try {
    return (await chrome.runtime.sendMessage({
      type: 'GET_DEBUG_SNAPSHOT',
      tabId
    } satisfies PanelToBackgroundMessage)) as KeyboardDebugSnapshot | null;
  } catch (error) {
    if (isContextInvalidationError(error)) {
      handlePanelInvalidation();
      return null;
    }

    throw error;
  }
}

async function refreshDebugSnapshot(): Promise<void> {
  if (!advancedDebugNode.open) {
    return;
  }

  if (!currentState.keyboard.enabled) {
    renderDebugSnapshot(null, 'Simulator disabled for this tab.');
    return;
  }

  const snapshot = await fetchDebugSnapshot();
  renderDebugSnapshot(snapshot);
}

function render(): void {
  const { keyboard } = currentState;
  enabledInput.checked = keyboard.enabled;
  debugInput.checked = keyboard.debug;
  visibilitySelect.value = keyboard.visibilityMode;
  presetSelect.value = keyboard.preset;
  enableLayoutFallbacksInput.checked = !keyboard.preferNativeViewport;
  heightNode.textContent = `${keyboard.heightPx}px`;
  activeSelectorNode.textContent = keyboard.activeSelector ?? 'None';
  shiftedNode.textContent = String(keyboard.shiftedElementCount);

  const disabled = keyboard.unsupportedReason !== null;
  enabledInput.disabled = disabled;
  debugInput.disabled = disabled || !keyboard.enabled;
  visibilitySelect.disabled = disabled || !keyboard.enabled;
  presetSelect.disabled = disabled || !keyboard.enabled;
  enableLayoutFallbacksInput.disabled = disabled || !keyboard.enabled;

  const statusParts = [];
  statusParts.push(keyboard.enabled ? 'Enabled' : 'Disabled');
  statusParts.push(keyboard.visible ? 'Visible' : 'Hidden');
  statusNode.textContent = statusParts.join(' / ');

  if (keyboard.unsupportedReason) {
    noticeNode.hidden = false;
    noticeNode.textContent = keyboard.unsupportedReason;
  } else {
    noticeNode.hidden = true;
    noticeNode.textContent = '';
  }

  if (advancedDebugNode.open) {
    void refreshDebugSnapshot();
  } else if (!keyboard.enabled) {
    renderDebugSnapshot(null, 'Open this section to inspect viewport shim state.');
  }
}

function handlePanelInvalidation(): void {
  if (panelInvalidated) {
    return;
  }

  panelInvalidated = true;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopDebugPolling();

  enabledInput.disabled = true;
  debugInput.disabled = true;
  visibilitySelect.disabled = true;
  presetSelect.disabled = true;
  enableLayoutFallbacksInput.disabled = true;
  debugRefreshButton.disabled = true;
  noticeNode.hidden = false;
  noticeNode.textContent = 'Extension reloaded. Close and reopen the Mock Keyboard panel.';
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

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing panel element: ${selector}`);
  }

  return element;
}

function startDebugPolling(): void {
  if (debugPollTimer !== null || panelInvalidated) {
    return;
  }

  const poll = () => {
    debugPollTimer = null;
    if (!advancedDebugNode.open || panelInvalidated) {
      return;
    }

    void refreshDebugSnapshot().finally(() => {
      if (!advancedDebugNode.open || panelInvalidated) {
        return;
      }

      debugPollTimer = window.setTimeout(poll, 500);
    });
  };

  debugPollTimer = window.setTimeout(poll, 500);
}

function stopDebugPolling(): void {
  if (debugPollTimer === null) {
    return;
  }

  window.clearTimeout(debugPollTimer);
  debugPollTimer = null;
}

function renderDebugSnapshot(
  snapshot: KeyboardDebugSnapshot | null,
  emptyMessage = 'No debug snapshot available yet.'
): void {
  debugRefreshButton.disabled = panelInvalidated || !currentState.keyboard.enabled;

  if (!snapshot) {
    debugBridgeNode.textContent = 'Unavailable';
    debugEventNode.textContent = 'None';
    debugViewportNode.textContent = 'Unavailable';
    debugShimNode.textContent = 'Unavailable';
    debugFallbackNode.textContent = 'Unavailable';
    debugSnapshotNode.textContent = emptyMessage;
    return;
  }

  debugBridgeNode.textContent = snapshot.bridgeReady
    ? snapshot.pendingBridgeEvent
      ? 'Ready / pending event'
      : 'Ready'
    : snapshot.bridgeInjected
      ? 'Injected / waiting'
      : 'Not injected';
  debugEventNode.textContent = snapshot.lastChange
    ? `${snapshot.lastChange.source} (${snapshot.lastChange.heightPx}px)`
    : 'None';
  debugViewportNode.textContent = formatViewportSummary(snapshot);
  debugShimNode.textContent = snapshot.page
    ? `${snapshot.page.shim.windowPatched ? 'window' : 'window off'} / ${
        snapshot.page.shim.visualViewportPatched ? 'visualViewport' : 'visualViewport off'
      } / ${snapshot.page.eventCount} events`
    : 'No page shim data';
  debugFallbackNode.textContent = snapshot.preferNativeViewport
    ? 'Native viewport'
    : formatFallbackSummary(snapshot);
  debugSnapshotNode.textContent = formatDebugSnapshot(snapshot);
}

function formatViewportSummary(snapshot: KeyboardDebugSnapshot): string {
  const viewport = snapshot.contentViewport;
  return `${Math.round(viewport.width)} x ${Math.round(viewport.height)} @ ${Math.round(
    viewport.offsetTop
  )},${Math.round(viewport.offsetLeft)}`;
}

function formatDebugSnapshot(snapshot: KeyboardDebugSnapshot): string {
  const lines = [
    'Controller',
    `  preferNativeViewport: ${snapshot.preferNativeViewport}`,
    `  visible: ${snapshot.visible}`,
    `  heightPx: ${snapshot.heightPx}`,
    `  preset: ${snapshot.preset}`,
    `  visibilityMode: ${snapshot.visibilityMode}`,
    `  activeSelector: ${snapshot.activeSelector ?? 'None'}`,
    `  shiftedElementCount: ${snapshot.shiftedElementCount}`,
    `  bridgeInjected: ${snapshot.bridgeInjected}`,
    `  bridgeReady: ${snapshot.bridgeReady}`,
    `  pendingBridgeEvent: ${snapshot.pendingBridgeEvent}`,
    `  contentViewport: ${Math.round(snapshot.contentViewport.width)} x ${Math.round(
      snapshot.contentViewport.height
    )} @ ${Math.round(snapshot.contentViewport.offsetTop)},${Math.round(
      snapshot.contentViewport.offsetLeft
    )}`,
    `  contentInner: ${snapshot.contentInnerWidth} x ${snapshot.contentInnerHeight}`,
    `  keyboardOffsetFormulaPx: ${snapshot.keyboardOffsetFormulaPx}`,
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
    lines.push(
      `  viewport: ${Math.round(snapshot.lastChange.viewportWidthPx ?? 0)} x ${Math.round(
        snapshot.lastChange.viewportHeightPx ?? 0
      )} @ ${Math.round(snapshot.lastChange.viewportOffsetTopPx ?? 0)},${Math.round(
        snapshot.lastChange.viewportOffsetLeftPx ?? 0
      )}`
    );
  }

  if (snapshot.page) {
    lines.push('Page shim');
    lines.push(`  eventCount: ${snapshot.page.eventCount}`);
    lines.push(`  keyboardOffsetFormulaPx: ${snapshot.page.keyboardOffsetFormulaPx}`);
    lines.push(`  windowPatched: ${snapshot.page.shim.windowPatched}`);
    lines.push(`  visualViewportPatched: ${snapshot.page.shim.visualViewportPatched}`);
    lines.push(
      `  base.inner: ${snapshot.page.base.innerWidth} x ${snapshot.page.base.innerHeight}`
    );
    lines.push(
      `  base.visualViewport: ${Math.round(snapshot.page.base.visualViewportWidth)} x ${Math.round(
        snapshot.page.base.visualViewportHeight
      )} @ ${Math.round(snapshot.page.base.visualViewportOffsetTop)},${Math.round(
        snapshot.page.base.visualViewportOffsetLeft
      )}`
    );
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
    lines.push('  No page-context debug snapshot available yet.');
  }

  return lines.join('\n');
}

function formatFallbackSummary(snapshot: KeyboardDebugSnapshot): string {
  const states = [];
  states.push(snapshot.fallback.bodyPaddingApplied ? 'padding on' : 'padding off');
  states.push(snapshot.fallback.shiftedElementsApplied ? 'shift on' : 'shift off');
  states.push(snapshot.fallback.autoScrollApplied ? 'scroll on' : 'scroll off');
  states.push(`overlap ${snapshot.fallback.focusedOverlapPx}px`);
  return states.join(' / ');
}
