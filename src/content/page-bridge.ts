(() => {
  // The page bridge runs in the page's own JS world so app code can observe the
  // mocked viewport values directly. Content scripts alone cannot do that because
  // they live in an isolated execution context.
  interface MockKeyboardChangeDetail {
    visible: boolean;
    heightPx: number;
    preset: 'android-compact' | 'android-standard' | 'android-tall';
    source: 'auto-focus' | 'manual' | 'forced-closed' | 'disabled';
    viewportWidthPx?: number;
    viewportHeightPx?: number;
    viewportOffsetTopPx?: number;
    viewportOffsetLeftPx?: number;
  }

  interface MockViewportShimState {
    detail: MockKeyboardChangeDetail | null;
    baseInnerHeight: number;
    baseInnerWidth: number;
    baseVisualViewportHeight: number;
    baseVisualViewportWidth: number;
    baseVisualViewportOffsetTop: number;
    baseVisualViewportOffsetLeft: number;
    visualViewportPatched: boolean;
    windowPatched: boolean;
    update: (detail: MockKeyboardChangeDetail) => void;
  }

  interface MockKeyboardDebugSnapshot {
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

  interface Window {
    __MOCK_KEYBOARD_BRIDGE__?: boolean;
    __MOCK_KEYBOARD_LAST__?: MockKeyboardChangeDetail;
    __MOCK_KEYBOARD_VIEWPORT_SHIM__?: MockViewportShimState;
    __MOCK_KEYBOARD_DEBUG__?: MockKeyboardDebugSnapshot;
    __MOCK_KEYBOARD_EVENT_COUNT__?: number;
  }

  type PageWindow = Window &
    typeof globalThis & {
      __MOCK_KEYBOARD_BRIDGE__?: boolean;
      __MOCK_KEYBOARD_LAST__?: MockKeyboardChangeDetail;
      __MOCK_KEYBOARD_VIEWPORT_SHIM__?: MockViewportShimState;
      __MOCK_KEYBOARD_DEBUG__?: MockKeyboardDebugSnapshot;
      __MOCK_KEYBOARD_EVENT_COUNT__?: number;
    };

  const PAGE_BRIDGE_EVENT_NAME = '__mockkeyboardbridge';
  const PAGE_PUBLIC_EVENT_NAME = 'mockkeyboardchange';
  const PAGE_BRIDGE_READY_ATTRIBUTE = 'data-mock-keyboard-bridge';
  const PAGE_DEBUG_NODE_ID = '__mock-keyboard-page-debug';
  const pageWindow = window as PageWindow;

  if (pageWindow.__MOCK_KEYBOARD_BRIDGE__) {
    document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, 'ready');
    return;
  }

  pageWindow.__MOCK_KEYBOARD_BRIDGE__ = true;
  document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, 'ready');
  const viewportShim = installViewportShim();
  pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = 0;

  document.addEventListener(PAGE_BRIDGE_EVENT_NAME, (event) => {
    const detail = (event as CustomEvent<MockKeyboardChangeDetail>).detail;
    pageWindow.__MOCK_KEYBOARD_LAST__ = detail;
    viewportShim.update(detail);
    pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = (pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ ?? 0) + 1;
    pageWindow.__MOCK_KEYBOARD_DEBUG__ = createDebugSnapshot(viewportShim, detail);
    publishDebugSnapshot(pageWindow.__MOCK_KEYBOARD_DEBUG__);
    window.dispatchEvent(new CustomEvent(PAGE_PUBLIC_EVENT_NAME, { detail }));
  });

  function installViewportShim(): MockViewportShimState {
    const state: MockViewportShimState = {
      detail: null,
      baseInnerHeight: window.innerHeight,
      baseInnerWidth: window.innerWidth,
      baseVisualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
      baseVisualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
      baseVisualViewportOffsetTop: window.visualViewport?.offsetTop ?? 0,
      baseVisualViewportOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
      visualViewportPatched: false,
      windowPatched: false,
      update(detail) {
        this.detail = detail;
        this.baseInnerHeight = Math.max(window.innerHeight, detail.viewportHeightPx ?? window.innerHeight);
        this.baseInnerWidth = Math.max(window.innerWidth, detail.viewportWidthPx ?? window.innerWidth);
        this.baseVisualViewportHeight = detail.viewportHeightPx ?? window.visualViewport?.height ?? window.innerHeight;
        this.baseVisualViewportWidth = detail.viewportWidthPx ?? window.visualViewport?.width ?? window.innerWidth;
        this.baseVisualViewportOffsetTop = detail.viewportOffsetTopPx ?? window.visualViewport?.offsetTop ?? 0;
        this.baseVisualViewportOffsetLeft = detail.viewportOffsetLeftPx ?? window.visualViewport?.offsetLeft ?? 0;
        dispatchViewportSignals();
      }
    };

    patchVisualViewport(state);
    patchWindowMetrics(state);
    pageWindow.__MOCK_KEYBOARD_VIEWPORT_SHIM__ = state;
    return state;
  }

  function patchVisualViewport(state: MockViewportShimState): void {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const patchedHeight = patchGetter(viewport, 'height', () =>
      getAdjustedViewportHeight(state, state.baseVisualViewportHeight)
    );
    const patchedWidth = patchGetter(viewport, 'width', () => state.baseVisualViewportWidth);
    const patchedOffsetTop = patchGetter(viewport, 'offsetTop', () => state.baseVisualViewportOffsetTop);
    const patchedOffsetLeft = patchGetter(viewport, 'offsetLeft', () => state.baseVisualViewportOffsetLeft);
    const patchedPageTop = patchGetter(viewport, 'pageTop', () => window.scrollY + state.baseVisualViewportOffsetTop);
    const patchedPageLeft = patchGetter(
      viewport,
      'pageLeft',
      () => window.scrollX + state.baseVisualViewportOffsetLeft
    );

    state.visualViewportPatched =
      patchedHeight || patchedWidth || patchedOffsetTop || patchedOffsetLeft || patchedPageTop || patchedPageLeft;
  }

  function patchWindowMetrics(state: MockViewportShimState): void {
    // Keep innerHeight stable. Many mobile layouts treat it as the larger layout
    // viewport while visualViewport.height reflects the keyboard-covered area.
    const patchedInnerHeight = patchGetter(window, 'innerHeight', () =>
      Math.round(state.baseInnerHeight)
    );
    const patchedInnerWidth = patchGetter(window, 'innerWidth', () => Math.round(state.baseInnerWidth));
    state.windowPatched = patchedInnerHeight || patchedInnerWidth;
  }

  function patchGetter<T extends object>(
    target: T,
    property: string,
    getter: () => number
  ): boolean {
    try {
      Object.defineProperty(target, property, {
        configurable: true,
        get: getter
      });
      return true;
    } catch {
      return false;
    }
  }

  function getAdjustedViewportHeight(state: MockViewportShimState, baseHeight: number): number {
    const keyboardHeight = state.detail?.visible ? state.detail.heightPx : 0;
    return Math.max(0, baseHeight - keyboardHeight);
  }

  function dispatchViewportSignals(): void {
    const windowResizeEvent = new Event('resize');
    const viewportResizeEvent = new Event('resize');
    const viewportScrollEvent = new Event('scroll');

    window.dispatchEvent(windowResizeEvent);
    window.visualViewport?.dispatchEvent(viewportResizeEvent);
    window.visualViewport?.dispatchEvent(viewportScrollEvent);
  }

  function createDebugSnapshot(
    state: MockViewportShimState,
    detail: MockKeyboardChangeDetail
  ): MockKeyboardDebugSnapshot {
    return {
      eventCount: pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ ?? 0,
      lastEvent: detail,
      keyboardOffsetFormulaPx: computeKeyboardOffsetFormulaPx(),
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

  function computeKeyboardOffsetFormulaPx(): number {
    return Math.max(
      0,
      Math.round(
        window.innerHeight -
          (window.visualViewport?.height ?? window.innerHeight) -
          (window.visualViewport?.offsetTop ?? 0)
      )
    );
  }

  function publishDebugSnapshot(snapshot: MockKeyboardDebugSnapshot): void {
    let debugNode = document.getElementById(PAGE_DEBUG_NODE_ID) as HTMLScriptElement | null;
    if (!debugNode) {
      debugNode = document.createElement('script');
      debugNode.id = PAGE_DEBUG_NODE_ID;
      debugNode.type = 'application/json';
      document.documentElement.append(debugNode);
    }

    debugNode.textContent = JSON.stringify(snapshot);
  }
})();
