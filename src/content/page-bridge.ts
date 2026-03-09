import type { MockKeyboardChangeDetail, PageDebugSnapshot } from '../shared/types';
import { computeKeyboardOffsetFormulaPx } from '../shared/utils';

interface PropertyPatch {
  restore(): void;
}

interface ViewportShimState {
  detail: MockKeyboardChangeDetail | null;
  baseInnerHeight: number;
  baseInnerWidth: number;
  baseVisualViewportHeight: number;
  baseVisualViewportWidth: number;
  baseVisualViewportOffsetTop: number;
  baseVisualViewportOffsetLeft: number;
  visualViewportPatched: boolean;
  windowPatched: boolean;
  propertyPatches: PropertyPatch[];
}

interface BridgeWindow extends Window {
  __MOCK_KEYBOARD_BRIDGE__?: boolean;
  __MOCK_KEYBOARD_BRIDGE_TEARDOWN__?: () => void;
  __MOCK_KEYBOARD_LAST__?: MockKeyboardChangeDetail;
  __MOCK_KEYBOARD_VIEWPORT_SHIM__?: ViewportShimState;
  __MOCK_KEYBOARD_DEBUG__?: PageDebugSnapshot;
  __MOCK_KEYBOARD_EVENT_COUNT__?: number;
}

const PAGE_BRIDGE_EVENT_NAME = '__mockkeyboardbridge';
const PAGE_BRIDGE_CONTROL_EVENT_NAME = '__mockkeyboardbridgecontrol';
const PAGE_PUBLIC_EVENT_NAME = 'mockkeyboardchange';
const PAGE_BRIDGE_READY_ATTRIBUTE = 'data-mock-keyboard-bridge';
const PAGE_DEBUG_NODE_ID = '__mock-keyboard-page-debug';

(() => {
  const pageWindow = window as BridgeWindow;

  if (pageWindow.__MOCK_KEYBOARD_BRIDGE__) {
    document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, 'ready');
    return;
  }

  const runtime = createBridgeRuntime(pageWindow);
  runtime.install();
})();

function createBridgeRuntime(pageWindow: BridgeWindow) {
  let eventCount = 0;
  let lastEvent: MockKeyboardChangeDetail = {
    visible: false,
    heightPx: 0,
    preset: 'android-standard',
    source: 'disabled'
  };
  const viewportShim = installViewportShim();

  const handleBridgeEvent = (event: Event) => {
    const detail = (event as CustomEvent<MockKeyboardChangeDetail>).detail;
    lastEvent = detail;
    eventCount += 1;

    pageWindow.__MOCK_KEYBOARD_LAST__ = detail;
    pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = eventCount;

    updateViewportShim(viewportShim, detail);
    const snapshot = createDebugSnapshot(viewportShim, detail, eventCount);
    pageWindow.__MOCK_KEYBOARD_DEBUG__ = snapshot;
    publishDebugSnapshot(snapshot);

    window.dispatchEvent(new CustomEvent(PAGE_PUBLIC_EVENT_NAME, { detail }));
  };

  const handleControlEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ type?: string }>).detail;
    if (detail?.type === 'teardown') {
      teardown();
    }
  };

  function install(): void {
    pageWindow.__MOCK_KEYBOARD_BRIDGE__ = true;
    pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = eventCount;
    pageWindow.__MOCK_KEYBOARD_VIEWPORT_SHIM__ = viewportShim;
    pageWindow.__MOCK_KEYBOARD_BRIDGE_TEARDOWN__ = teardown;

    document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, 'ready');
    document.addEventListener(PAGE_BRIDGE_EVENT_NAME, handleBridgeEvent);
    document.addEventListener(PAGE_BRIDGE_CONTROL_EVENT_NAME, handleControlEvent);
  }

  function teardown(): void {
    document.removeEventListener(PAGE_BRIDGE_EVENT_NAME, handleBridgeEvent);
    document.removeEventListener(PAGE_BRIDGE_CONTROL_EVENT_NAME, handleControlEvent);
    restoreViewportShim(viewportShim);

    document.documentElement.removeAttribute(PAGE_BRIDGE_READY_ATTRIBUTE);
    document.getElementById(PAGE_DEBUG_NODE_ID)?.remove();

    delete pageWindow.__MOCK_KEYBOARD_BRIDGE__;
    delete pageWindow.__MOCK_KEYBOARD_BRIDGE_TEARDOWN__;
    delete pageWindow.__MOCK_KEYBOARD_LAST__;
    delete pageWindow.__MOCK_KEYBOARD_VIEWPORT_SHIM__;
    delete pageWindow.__MOCK_KEYBOARD_DEBUG__;
    delete pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__;
  }

  return { install };
}

// The page bridge only patches what app code can read directly. The controller
// still owns the overlay and extension messaging in the isolated world.
function installViewportShim(): ViewportShimState {
  const state: ViewportShimState = {
    detail: null,
    baseInnerHeight: window.innerHeight,
    baseInnerWidth: window.innerWidth,
    baseVisualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
    baseVisualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
    baseVisualViewportOffsetTop: window.visualViewport?.offsetTop ?? 0,
    baseVisualViewportOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
    visualViewportPatched: false,
    windowPatched: false,
    propertyPatches: []
  };

  patchVisualViewport(state);
  patchWindowMetrics(state);
  return state;
}

function updateViewportShim(state: ViewportShimState, detail: MockKeyboardChangeDetail): void {
  state.detail = detail;
  state.baseInnerHeight = Math.max(window.innerHeight, detail.viewportHeightPx ?? window.innerHeight);
  state.baseInnerWidth = Math.max(window.innerWidth, detail.viewportWidthPx ?? window.innerWidth);
  state.baseVisualViewportHeight = detail.viewportHeightPx ?? window.visualViewport?.height ?? window.innerHeight;
  state.baseVisualViewportWidth = detail.viewportWidthPx ?? window.visualViewport?.width ?? window.innerWidth;
  state.baseVisualViewportOffsetTop = detail.viewportOffsetTopPx ?? window.visualViewport?.offsetTop ?? 0;
  state.baseVisualViewportOffsetLeft = detail.viewportOffsetLeftPx ?? window.visualViewport?.offsetLeft ?? 0;
  dispatchViewportSignals();
}

function restoreViewportShim(state: ViewportShimState): void {
  state.detail = null;
  for (const patch of state.propertyPatches) {
    patch.restore();
  }
  state.propertyPatches = [];
  state.visualViewportPatched = false;
  state.windowPatched = false;
  dispatchViewportSignals();
}

function patchVisualViewport(state: ViewportShimState): void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }

  const patches = [
    createGetterPatch(viewport, 'height', () => getAdjustedViewportHeight(state)),
    createGetterPatch(viewport, 'width', () => state.baseVisualViewportWidth),
    createGetterPatch(viewport, 'offsetTop', () => state.baseVisualViewportOffsetTop),
    createGetterPatch(viewport, 'offsetLeft', () => state.baseVisualViewportOffsetLeft),
    createGetterPatch(viewport, 'pageTop', () => window.scrollY + state.baseVisualViewportOffsetTop),
    createGetterPatch(viewport, 'pageLeft', () => window.scrollX + state.baseVisualViewportOffsetLeft)
  ].filter((patch): patch is PropertyPatch => patch !== null);

  state.propertyPatches.push(...patches);
  state.visualViewportPatched = patches.length > 0;
}

function patchWindowMetrics(state: ViewportShimState): void {
  const patches = [
    createGetterPatch(window, 'innerHeight', () => Math.round(state.baseInnerHeight)),
    createGetterPatch(window, 'innerWidth', () => Math.round(state.baseInnerWidth))
  ].filter((patch): patch is PropertyPatch => patch !== null);

  state.propertyPatches.push(...patches);
  state.windowPatched = patches.length > 0;
}

function createGetterPatch<T extends object>(
  target: T,
  property: string,
  getter: () => number
): PropertyPatch | null {
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, property);

  try {
    Object.defineProperty(target, property, {
      configurable: true,
      get: getter
    });

    return {
      restore() {
        if (ownDescriptor) {
          Object.defineProperty(target, property, ownDescriptor);
          return;
        }

        delete (target as Record<string, unknown>)[property];
      }
    };
  } catch {
    return null;
  }
}

function getAdjustedViewportHeight(state: ViewportShimState): number {
  const keyboardHeight = state.detail?.visible ? state.detail.heightPx : 0;
  return Math.max(0, state.baseVisualViewportHeight - keyboardHeight);
}

function dispatchViewportSignals(): void {
  window.dispatchEvent(new Event('resize'));
  window.visualViewport?.dispatchEvent(new Event('resize'));
  window.visualViewport?.dispatchEvent(new Event('scroll'));
}

function createDebugSnapshot(
  state: ViewportShimState,
  detail: MockKeyboardChangeDetail,
  eventCount: number
): PageDebugSnapshot {
  return {
    eventCount,
    lastEvent: detail,
    keyboardOffsetFormulaPx: computeKeyboardOffsetFormulaPx(window),
    shim: {
      visualViewportPatched: state.visualViewportPatched,
      windowPatched: state.windowPatched
    },
    base: {
      innerHeight: state.baseInnerHeight,
      innerWidth: state.baseInnerWidth,
      visualViewportHeight: state.baseVisualViewportHeight,
      visualViewportWidth: state.baseVisualViewportWidth,
      visualViewportOffsetTop: state.baseVisualViewportOffsetTop,
      visualViewportOffsetLeft: state.baseVisualViewportOffsetLeft
    },
    observed: {
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      visualViewportHeight: window.visualViewport?.height ?? null,
      visualViewportWidth: window.visualViewport?.width ?? null,
      visualViewportOffsetTop: window.visualViewport?.offsetTop ?? null,
      visualViewportOffsetLeft: window.visualViewport?.offsetLeft ?? null
    }
  };
}

function publishDebugSnapshot(snapshot: PageDebugSnapshot): void {
  let debugNode = document.getElementById(PAGE_DEBUG_NODE_ID) as HTMLScriptElement | null;
  if (!debugNode) {
    debugNode = document.createElement('script');
    debugNode.id = PAGE_DEBUG_NODE_ID;
    debugNode.type = 'application/json';
    document.documentElement.append(debugNode);
  }

  debugNode.textContent = JSON.stringify(snapshot);
}
