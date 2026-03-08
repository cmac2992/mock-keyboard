export type KeyboardPreset = 'android-compact' | 'android-standard' | 'android-tall';
export type VisibilityMode = 'auto' | 'force-open' | 'force-closed';

export interface KeyboardState {
  enabled: boolean;
  visibilityMode: VisibilityMode;
  preset: KeyboardPreset;
  preferNativeViewport: boolean;
  visible: boolean;
  heightPx: number;
  debug: boolean;
  activeSelector: string | null;
  shiftedElementCount: number;
  unsupportedReason: string | null;
}

export interface TabState {
  tabId: number;
  keyboard: KeyboardState;
}

export type PanelToBackgroundMessage =
  | { type: 'INIT_TAB'; tabId: number }
  | { type: 'SET_ENABLED'; tabId: number; enabled: boolean }
  | { type: 'SET_VISIBILITY_MODE'; tabId: number; visibilityMode: VisibilityMode }
  | { type: 'SET_PRESET'; tabId: number; preset: KeyboardPreset }
  | { type: 'SET_PREFER_NATIVE_VIEWPORT'; tabId: number; preferNativeViewport: boolean }
  | { type: 'SET_DEBUG'; tabId: number; debug: boolean }
  | { type: 'GET_DEBUG_SNAPSHOT'; tabId: number };

export type BackgroundToContentMessage =
  | { type: 'SYNC_STATE'; state: KeyboardState }
  | { type: 'GET_DEBUG_SNAPSHOT' };

export type ContentToBackgroundMessage = {
  type: 'CONTENT_STATE';
  tabId: number;
  state: KeyboardState;
};

export interface MockKeyboardChangeDetail {
  visible: boolean;
  heightPx: number;
  preset: KeyboardPreset;
  source: 'auto-focus' | 'manual' | 'forced-closed' | 'disabled';
  viewportWidthPx?: number;
  viewportHeightPx?: number;
  viewportOffsetTopPx?: number;
  viewportOffsetLeftPx?: number;
}

export interface PanelPortMessage {
  type: 'TAB_STATE';
  state: TabState;
}

export interface KeyboardViewportMetrics {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
}

export interface PageDebugSnapshot {
  eventCount: number;
  lastEvent: MockKeyboardChangeDetail;
  keyboardOffsetFormulaPx: number;
  shim: {
    visualViewportPatched: boolean;
    windowPatched: boolean;
  };
  base: {
    innerHeight: number;
    innerWidth: number;
    visualViewportHeight: number;
    visualViewportWidth: number;
    visualViewportOffsetTop: number;
    visualViewportOffsetLeft: number;
  };
  observed: {
    innerHeight: number;
    innerWidth: number;
    visualViewportHeight: number | null;
    visualViewportWidth: number | null;
    visualViewportOffsetTop: number | null;
    visualViewportOffsetLeft: number | null;
  };
}

export interface KeyboardDebugSnapshot {
  bridgeInjected: boolean;
  bridgeReady: boolean;
  pendingBridgeEvent: boolean;
  preferNativeViewport: boolean;
  visible: boolean;
  heightPx: number;
  preset: KeyboardPreset;
  visibilityMode: VisibilityMode;
  activeSelector: string | null;
  shiftedElementCount: number;
  contentViewport: KeyboardViewportMetrics;
  contentInnerHeight: number;
  contentInnerWidth: number;
  keyboardOffsetFormulaPx: number;
  fallback: {
    scheduled: boolean;
    bodyPaddingApplied: boolean;
    shiftedElementsApplied: boolean;
    autoScrollApplied: boolean;
    focusedOverlapPx: number;
    focusedAnchored: boolean;
  };
  lastChange: MockKeyboardChangeDetail | null;
  page: PageDebugSnapshot | null;
}

export interface OriginalStyleSnapshot {
  transform: string;
  transition: string;
  bottom: string;
}
