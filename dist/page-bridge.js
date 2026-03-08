(() => {
    const PAGE_BRIDGE_EVENT_NAME = '__mockkeyboardbridge';
    const PAGE_PUBLIC_EVENT_NAME = 'mockkeyboardchange';
    const PAGE_BRIDGE_READY_ATTRIBUTE = 'data-mock-keyboard-bridge';
    const PAGE_DEBUG_NODE_ID = '__mock-keyboard-page-debug';
    const pageWindow = window;
    if (pageWindow.__MOCK_KEYBOARD_BRIDGE__) {
        document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, 'ready');
        return;
    }
    pageWindow.__MOCK_KEYBOARD_BRIDGE__ = true;
    document.documentElement.setAttribute(PAGE_BRIDGE_READY_ATTRIBUTE, 'ready');
    const viewportShim = installViewportShim();
    pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = 0;
    document.addEventListener(PAGE_BRIDGE_EVENT_NAME, (event) => {
        const detail = event.detail;
        pageWindow.__MOCK_KEYBOARD_LAST__ = detail;
        viewportShim.update(detail);
        pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ = (pageWindow.__MOCK_KEYBOARD_EVENT_COUNT__ ?? 0) + 1;
        pageWindow.__MOCK_KEYBOARD_DEBUG__ = createDebugSnapshot(viewportShim, detail);
        publishDebugSnapshot(pageWindow.__MOCK_KEYBOARD_DEBUG__);
        window.dispatchEvent(new CustomEvent(PAGE_PUBLIC_EVENT_NAME, { detail }));
    });
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
    function patchVisualViewport(state) {
        const viewport = window.visualViewport;
        if (!viewport) {
            return;
        }
        const patchedHeight = patchGetter(viewport, 'height', () => getAdjustedViewportHeight(state, state.baseVisualViewportHeight));
        const patchedWidth = patchGetter(viewport, 'width', () => state.baseVisualViewportWidth);
        const patchedOffsetTop = patchGetter(viewport, 'offsetTop', () => state.baseVisualViewportOffsetTop);
        const patchedOffsetLeft = patchGetter(viewport, 'offsetLeft', () => state.baseVisualViewportOffsetLeft);
        const patchedPageTop = patchGetter(viewport, 'pageTop', () => window.scrollY + state.baseVisualViewportOffsetTop);
        const patchedPageLeft = patchGetter(viewport, 'pageLeft', () => window.scrollX + state.baseVisualViewportOffsetLeft);
        state.visualViewportPatched =
            patchedHeight || patchedWidth || patchedOffsetTop || patchedOffsetLeft || patchedPageTop || patchedPageLeft;
    }
    function patchWindowMetrics(state) {
        // Keep innerHeight stable. Many mobile layouts treat it as the larger layout
        // viewport while visualViewport.height reflects the keyboard-covered area.
        const patchedInnerHeight = patchGetter(window, 'innerHeight', () => Math.round(state.baseInnerHeight));
        const patchedInnerWidth = patchGetter(window, 'innerWidth', () => Math.round(state.baseInnerWidth));
        state.windowPatched = patchedInnerHeight || patchedInnerWidth;
    }
    function patchGetter(target, property, getter) {
        try {
            Object.defineProperty(target, property, {
                configurable: true,
                get: getter
            });
            return true;
        }
        catch {
            return false;
        }
    }
    function getAdjustedViewportHeight(state, baseHeight) {
        const keyboardHeight = state.detail?.visible ? state.detail.heightPx : 0;
        return Math.max(0, baseHeight - keyboardHeight);
    }
    function dispatchViewportSignals() {
        const windowResizeEvent = new Event('resize');
        const viewportResizeEvent = new Event('resize');
        const viewportScrollEvent = new Event('scroll');
        window.dispatchEvent(windowResizeEvent);
        window.visualViewport?.dispatchEvent(viewportResizeEvent);
        window.visualViewport?.dispatchEvent(viewportScrollEvent);
    }
    function createDebugSnapshot(state, detail) {
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
    function computeKeyboardOffsetFormulaPx() {
        return Math.max(0, Math.round(window.innerHeight -
            (window.visualViewport?.height ?? window.innerHeight) -
            (window.visualViewport?.offsetTop ?? 0)));
    }
    function publishDebugSnapshot(snapshot) {
        let debugNode = document.getElementById(PAGE_DEBUG_NODE_ID);
        if (!debugNode) {
            debugNode = document.createElement('script');
            debugNode.id = PAGE_DEBUG_NODE_ID;
            debugNode.type = 'application/json';
            document.documentElement.append(debugNode);
        }
        debugNode.textContent = JSON.stringify(snapshot);
    }
})();
