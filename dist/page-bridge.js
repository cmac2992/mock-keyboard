"use strict";
(() => {
  // src/shared/utils.ts
  function computeKeyboardOffsetFormulaPx(win) {
    const visualViewport = win.visualViewport;
    return Math.max(
      0,
      Math.round(
        win.innerHeight - (visualViewport?.height ?? win.innerHeight) - (visualViewport?.offsetTop ?? 0)
      )
    );
  }

  // src/content/page-bridge.ts
  var PAGE_BRIDGE_EVENT_NAME = "__mockkeyboardbridge";
  var PAGE_BRIDGE_CONTROL_EVENT_NAME = "__mockkeyboardbridgecontrol";
  var PAGE_PUBLIC_EVENT_NAME = "mockkeyboardchange";
  var PAGE_BRIDGE_READY_ATTRIBUTE = "data-mock-keyboard-bridge";
  var PAGE_DEBUG_NODE_ID = "__mock-keyboard-page-debug";
  (() => {
    const pageWindow = window;
    if (pageWindow.__MOCK_KEYBOARD_BRIDGE__) {
      document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, "ready");
      return;
    }
    const runtime = createBridgeRuntime(pageWindow);
    runtime.install();
  })();
  function createBridgeRuntime(pageWindow) {
    let eventCount = 0;
    let lastEvent = {
      visible: false,
      heightPx: 0,
      preset: "android-standard",
      source: "disabled"
    };
    const viewportShim = installViewportShim();
    const handleBridgeEvent = (event) => {
      const detail = event.detail;
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
    const handleControlEvent = (event) => {
      const detail = event.detail;
      if (detail?.type === "teardown") {
        teardown();
      }
    };
    function install() {
      pageWindow.__MOCK_KEYBOARD_BRIDGE__ = true;
      pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = eventCount;
      pageWindow.__MOCK_KEYBOARD_VIEWPORT_SHIM__ = viewportShim;
      pageWindow.__MOCK_KEYBOARD_BRIDGE_TEARDOWN__ = teardown;
      document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, "ready");
      document.addEventListener(PAGE_BRIDGE_EVENT_NAME, handleBridgeEvent);
      document.addEventListener(PAGE_BRIDGE_CONTROL_EVENT_NAME, handleControlEvent);
    }
    function teardown() {
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
  function installViewportShim() {
    const state = {
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
  function updateViewportShim(state, detail) {
    state.detail = detail;
    state.baseInnerHeight = Math.max(window.innerHeight, detail.viewportHeightPx ?? window.innerHeight);
    state.baseInnerWidth = Math.max(window.innerWidth, detail.viewportWidthPx ?? window.innerWidth);
    state.baseVisualViewportHeight = detail.viewportHeightPx ?? window.visualViewport?.height ?? window.innerHeight;
    state.baseVisualViewportWidth = detail.viewportWidthPx ?? window.visualViewport?.width ?? window.innerWidth;
    state.baseVisualViewportOffsetTop = detail.viewportOffsetTopPx ?? window.visualViewport?.offsetTop ?? 0;
    state.baseVisualViewportOffsetLeft = detail.viewportOffsetLeftPx ?? window.visualViewport?.offsetLeft ?? 0;
    dispatchViewportSignals();
  }
  function restoreViewportShim(state) {
    state.detail = null;
    for (const patch of state.propertyPatches) {
      patch.restore();
    }
    state.propertyPatches = [];
    state.visualViewportPatched = false;
    state.windowPatched = false;
    dispatchViewportSignals();
  }
  function patchVisualViewport(state) {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const patches = [
      createGetterPatch(viewport, "height", () => getAdjustedViewportHeight(state)),
      createGetterPatch(viewport, "width", () => state.baseVisualViewportWidth),
      createGetterPatch(viewport, "offsetTop", () => state.baseVisualViewportOffsetTop),
      createGetterPatch(viewport, "offsetLeft", () => state.baseVisualViewportOffsetLeft),
      createGetterPatch(viewport, "pageTop", () => window.scrollY + state.baseVisualViewportOffsetTop),
      createGetterPatch(viewport, "pageLeft", () => window.scrollX + state.baseVisualViewportOffsetLeft)
    ].filter((patch) => patch !== null);
    state.propertyPatches.push(...patches);
    state.visualViewportPatched = patches.length > 0;
  }
  function patchWindowMetrics(state) {
    const patches = [
      createGetterPatch(window, "innerHeight", () => Math.round(state.baseInnerHeight)),
      createGetterPatch(window, "innerWidth", () => Math.round(state.baseInnerWidth))
    ].filter((patch) => patch !== null);
    state.propertyPatches.push(...patches);
    state.windowPatched = patches.length > 0;
  }
  function createGetterPatch(target, property, getter) {
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
          delete target[property];
        }
      };
    } catch {
      return null;
    }
  }
  function getAdjustedViewportHeight(state) {
    const keyboardHeight = state.detail?.visible ? state.detail.heightPx : 0;
    return Math.max(0, state.baseVisualViewportHeight - keyboardHeight);
  }
  function dispatchViewportSignals() {
    window.dispatchEvent(new Event("resize"));
    window.visualViewport?.dispatchEvent(new Event("resize"));
    window.visualViewport?.dispatchEvent(new Event("scroll"));
  }
  function createDebugSnapshot(state, detail, eventCount) {
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
  function publishDebugSnapshot(snapshot) {
    let debugNode = document.getElementById(PAGE_DEBUG_NODE_ID);
    if (!debugNode) {
      debugNode = document.createElement("script");
      debugNode.id = PAGE_DEBUG_NODE_ID;
      debugNode.type = "application/json";
      document.documentElement.append(debugNode);
    }
    debugNode.textContent = JSON.stringify(snapshot);
  }
})();
