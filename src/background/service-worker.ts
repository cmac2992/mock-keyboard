import {
  DEFAULT_KEYBOARD_STATE,
  DEFAULTS_STORAGE_KEY,
  PANEL_PORT_PREFIX,
  TAB_STATE_STORAGE_PREFIX
} from '../shared/constants';
import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  KeyboardDebugSnapshot,
  KeyboardState,
  PanelPortMessage,
  PanelToBackgroundMessage,
  TabState
} from '../shared/types';
import { supportsRuntimeInjection } from '../shared/utils';

const panelPorts = new Map<number, Set<chrome.runtime.Port>>();
const inMemoryStates = new Map<number, TabState>();

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith(PANEL_PORT_PREFIX)) {
    return;
  }

  const tabId = Number(port.name.slice(PANEL_PORT_PREFIX.length));
  const ports = panelPorts.get(tabId) ?? new Set<chrome.runtime.Port>();
  ports.add(port);
  panelPorts.set(tabId, ports);

  void getOrCreateState(tabId).then((state) => {
    port.postMessage({ type: 'TAB_STATE', state } satisfies PanelPortMessage);
  });

  port.onDisconnect.addListener(() => {
    const existing = panelPorts.get(tabId);
    existing?.delete(port);
    if (existing && existing.size === 0) {
      panelPorts.delete(tabId);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false;
  }

  if (message.type === 'GET_DEBUG_SNAPSHOT') {
    void getDebugSnapshot(message.tabId).then((snapshot) => {
      sendResponse(snapshot);
    }).catch(() => {
      sendResponse(null);
    });
    return true;
  }

  void handleMessage(
    message as PanelToBackgroundMessage | ContentToBackgroundMessage,
    sender
  ).then((state) => {
    sendResponse(state);
  }).catch(async () => {
    if ('tabId' in message && typeof message.tabId === 'number' && message.tabId > 0) {
      sendResponse(await getOrCreateState(message.tabId));
      return;
    }

    sendResponse(undefined);
  });

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  inMemoryStates.delete(tabId);
  void chrome.storage.session.remove(getTabStorageKey(tabId));
  panelPorts.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') {
    return;
  }

  void getOrCreateState(tabId).then(async (state) => {
    if (!state.keyboard.enabled) {
      return;
    }

    const injected = await ensureContentScript(tabId);
    if (!injected) {
      return;
    }

    await syncStateToTab(tabId, state.keyboard);
  });
});

async function handleMessage(
  message: PanelToBackgroundMessage | ContentToBackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<TabState | undefined> {
  if (message.type === 'CONTENT_STATE') {
    const tabId = sender.tab?.id ?? message.tabId;
    if (!tabId) {
      return undefined;
    }

    const existing = await getOrCreateState(tabId);
    const nextState: TabState = {
      tabId,
      keyboard: {
        ...existing.keyboard,
        visible: message.state.visible,
        heightPx: message.state.heightPx,
        activeSelector: message.state.activeSelector,
        shiftedElementCount: message.state.shiftedElementCount,
        unsupportedReason: message.state.unsupportedReason
      }
    };
    await persistState(nextState);
    broadcastState(nextState);
    return nextState;
  }

  const current = await getOrCreateState(message.tabId);
  let nextState = current;

  switch (message.type) {
    case 'INIT_TAB':
      break;
    case 'SET_ENABLED':
      nextState = {
        tabId: current.tabId,
        keyboard: {
          ...current.keyboard,
          enabled: message.enabled,
          unsupportedReason: null
        }
      };
      if (message.enabled) {
        const injected = await ensureContentScript(message.tabId);
        if (!injected) {
          nextState = {
            ...nextState,
            keyboard: {
              ...nextState.keyboard,
              enabled: false,
              unsupportedReason: 'Unsupported page. The extension can only run on regular http/https documents.'
            }
          };
        }
      } else {
        nextState = {
          ...nextState,
          keyboard: {
            ...nextState.keyboard,
            visible: false,
            heightPx: 0,
            activeSelector: null,
            shiftedElementCount: 0
          }
        };
      }
      break;
    case 'SET_VISIBILITY_MODE':
      nextState = {
        tabId: current.tabId,
        keyboard: {
          ...current.keyboard,
          visibilityMode: message.visibilityMode
        }
      };
      await persistDefaults(nextState.keyboard);
      break;
    case 'SET_PRESET':
      nextState = {
        tabId: current.tabId,
        keyboard: {
          ...current.keyboard,
          preset: message.preset
        }
      };
      await persistDefaults(nextState.keyboard);
      break;
    case 'SET_PREFER_NATIVE_VIEWPORT':
      nextState = {
        tabId: current.tabId,
        keyboard: {
          ...current.keyboard,
          preferNativeViewport: message.preferNativeViewport
        }
      };
      await persistDefaults(nextState.keyboard);
      break;
    case 'SET_DEBUG':
      nextState = {
        tabId: current.tabId,
        keyboard: {
          ...current.keyboard,
          debug: message.debug
        }
      };
      await persistDefaults(nextState.keyboard);
      break;
  }

  await persistState(nextState);

  if (nextState.keyboard.enabled) {
    await syncStateToTab(message.tabId, nextState.keyboard).catch(() => undefined);
  } else if (current.keyboard.enabled || nextState.keyboard.unsupportedReason === null) {
    await syncStateToTab(message.tabId, nextState.keyboard).catch(() => undefined);
  }

  broadcastState(nextState);
  return nextState;
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!supportsRuntimeInjection(tab.url)) {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
    return true;
  } catch {
    return false;
  }
}

async function syncStateToTab(tabId: number, state: KeyboardState): Promise<void> {
  const message: BackgroundToContentMessage = { type: 'SYNC_STATE', state };
  await chrome.tabs.sendMessage(tabId, message);
}

async function getDebugSnapshot(tabId: number): Promise<KeyboardDebugSnapshot | null> {
  const directSnapshot = await requestDebugSnapshotFromTab(tabId);
  if (directSnapshot) {
    return directSnapshot;
  }

  const state = await getOrCreateState(tabId);
  if (!state.keyboard.enabled) {
    return null;
  }

  const injected = await ensureContentScript(tabId);
  if (!injected) {
    return null;
  }

  return requestDebugSnapshotFromTab(tabId);
}

async function requestDebugSnapshotFromTab(tabId: number): Promise<KeyboardDebugSnapshot | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, {
      type: 'GET_DEBUG_SNAPSHOT'
    } satisfies BackgroundToContentMessage)) as KeyboardDebugSnapshot | null;
  } catch {
    return null;
  }
}

async function getOrCreateState(tabId: number): Promise<TabState> {
  const existing = inMemoryStates.get(tabId);
  if (existing) {
    return existing;
  }

  const storedState = (await chrome.storage.session.get(getTabStorageKey(tabId)))[
    getTabStorageKey(tabId)
  ] as TabState | undefined;
  if (storedState) {
    inMemoryStates.set(tabId, storedState);
    return storedState;
  }

  const defaults = ((await chrome.storage.local.get(DEFAULTS_STORAGE_KEY))[DEFAULTS_STORAGE_KEY] ??
    {}) as Partial<KeyboardState>;

  const state: TabState = {
    tabId,
    keyboard: {
      ...DEFAULT_KEYBOARD_STATE,
      preset: defaults.preset ?? DEFAULT_KEYBOARD_STATE.preset,
      visibilityMode: defaults.visibilityMode ?? DEFAULT_KEYBOARD_STATE.visibilityMode,
      preferNativeViewport:
        defaults.preferNativeViewport ?? DEFAULT_KEYBOARD_STATE.preferNativeViewport,
      debug: defaults.debug ?? DEFAULT_KEYBOARD_STATE.debug
    }
  };

  await persistState(state);
  return state;
}

async function persistState(state: TabState): Promise<void> {
  inMemoryStates.set(state.tabId, state);
  await chrome.storage.session.set({
    [getTabStorageKey(state.tabId)]: state
  });
}

async function persistDefaults(state: KeyboardState): Promise<void> {
  await chrome.storage.local.set({
    [DEFAULTS_STORAGE_KEY]: {
      preset: state.preset,
      visibilityMode: state.visibilityMode,
      preferNativeViewport: state.preferNativeViewport,
      debug: state.debug
    }
  });
}

function broadcastState(state: TabState): void {
  const ports = panelPorts.get(state.tabId);
  if (!ports) {
    return;
  }

  const message: PanelPortMessage = { type: 'TAB_STATE', state };
  for (const port of ports) {
    port.postMessage(message);
  }
}

function getTabStorageKey(tabId: number): string {
  return `${TAB_STATE_STORAGE_PREFIX}${tabId}`;
}
