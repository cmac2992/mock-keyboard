(() => {
    const ANCHOR_ATTRIBUTE = 'data-mock-keyboard-anchor';
    const IGNORE_ATTRIBUTE = 'data-mock-keyboard-ignore';
    const ROOT_DATA_ATTRIBUTE = 'data-mock-keyboard';
    const CONTENT_BRIDGE_EVENT_NAME = '__mockkeyboardbridge';
    const CONTENT_PUBLIC_EVENT_NAME = 'mockkeyboardchange';
    const OVERLAY_HOST_ID = '__mock-keyboard-host';
    const PAGE_BRIDGE_READY_ATTRIBUTE = 'data-mock-keyboard-bridge';
    const PAGE_DEBUG_NODE_ID = '__mock-keyboard-page-debug';
    const ANIMATION_MS = 220;
    const pageWindow = window;
    const NON_TEXT_INPUT_TYPES = new Set([
        'button',
        'checkbox',
        'color',
        'file',
        'hidden',
        'image',
        'radio',
        'range',
        'reset',
        'submit'
    ]);
    const DEFAULT_KEYBOARD_STATE = {
        enabled: false,
        visibilityMode: 'auto',
        preset: 'android-standard',
        preferNativeViewport: true,
        visible: false,
        heightPx: 0,
        debug: false,
        activeSelector: null,
        shiftedElementCount: 0,
        unsupportedReason: null
    };
    const OVERLAY_CSS = `
  :host { all: initial; }
  .mk-root { inset: 0; pointer-events: none; position: fixed; z-index: 2147483647; }

  /* Debug safe-area overlay */
  .mk-safe-area {
    background: linear-gradient(180deg, rgba(255, 111, 26, 0.14), rgba(255, 111, 26, 0.02));
    border-top: 1px dashed rgba(255, 111, 26, 0.4);
    opacity: 0;
    position: absolute;
    transition: opacity 220ms ease;
  }
  .mk-safe-area[data-visible="true"] { opacity: 1; }

  /* ── Keyboard shell ─────────────────────────────────── */
  .mk-keyboard {
    /* Gboard light-theme color tokens */
    --mk-bg:         #EEF2F6;
    --mk-key-bg:     #FFFFFF;
    --mk-fn-bg:      #AAB4BF;
    --mk-key-color:  #1A1A1A;
    --mk-shadow:     rgba(0, 0, 0, 0.28);
    --mk-strip-bg:   #F7F9FC;
    --mk-divider:    #CDD1D6;
    /* Spacing/size tokens — android-standard defaults */
    --mk-side:       5px;
    --mk-row-gap:    9px;
    --mk-key-gap:    6px;
    --mk-key-h:      42px;
    --mk-strip-h:    40px;
    --mk-letter-sz:  16px;
    --mk-fn-sz:      13px;
    --mk-radius:     5px;
    --mk-offset:     clamp(6px, 3.2vw, 20px);

    background: var(--mk-bg);
    box-sizing: border-box;
    opacity: 0;
    overflow: hidden;
    padding: 0 var(--mk-side);
    position: absolute;
    transform: translate3d(0, 24px, 0);
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
                opacity   220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .mk-keyboard[data-visible="true"] { opacity: 1; transform: translate3d(0, 0, 0); }

  /* ── Presets ────────────────────────────────────────── */
  .mk-keyboard[data-preset="android-compact"] {
    --mk-row-gap:   7px;
    --mk-key-gap:   5px;
    --mk-key-h:     36px;
    --mk-strip-h:   34px;
    --mk-letter-sz: 14px;
    --mk-fn-sz:     11px;
  }
  .mk-keyboard[data-preset="android-tall"] {
    --mk-row-gap:   11px;
    --mk-key-gap:   7px;
    --mk-key-h:     50px;
    --mk-strip-h:   46px;
    --mk-letter-sz: 18px;
    --mk-fn-sz:     14px;
  }

  /* ── Suggestion strip ───────────────────────────────── */
  .mk-suggestion-strip {
    align-items: center;
    background: var(--mk-strip-bg);
    border-bottom: 1px solid var(--mk-divider);
    display: flex;
    height: var(--mk-strip-h);
    margin: 0 calc(-1 * var(--mk-side));
    padding: 0 2px;
  }
  .mk-strip-icon {
    align-items: center;
    color: #5F6368;
    display: flex;
    flex-shrink: 0;
    height: 100%;
    justify-content: center;
    width: 40px;
  }
  .mk-strip-divider {
    background: var(--mk-divider);
    flex-shrink: 0;
    height: 55%;
    width: 1px;
  }
  .mk-suggestion {
    align-items: center;
    color: #3C4043;
    display: flex;
    flex: 1;
    font-family: "Roboto", "Noto Sans", sans-serif;
    font-size: 14px;
    font-weight: 400;
    justify-content: center;
    overflow: hidden;
    white-space: nowrap;
  }

  /* ── Key rows ───────────────────────────────────────── */
  .mk-rows {
    display: grid;
    gap: var(--mk-row-gap);
    padding-top: var(--mk-row-gap);
  }
  .mk-row {
    display: grid;
    gap: var(--mk-key-gap);
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
  }
  .mk-row--offset { padding-inline: var(--mk-offset); }
  .mk-row--shift  { grid-template-columns: 1.5fr repeat(7, 1fr) 1.5fr; }
  .mk-row--bottom { grid-template-columns: 1.35fr 0.7fr 0.7fr 4fr 0.7fr 1.35fr; }

  /* ── Individual key ─────────────────────────────────── */
  .mk-key {
    align-items: center;
    background: var(--mk-key-bg);
    border-radius: var(--mk-radius);
    box-shadow: 0 1px 0 var(--mk-shadow);
    color: var(--mk-key-color);
    display: flex;
    font-family: "Roboto", "Noto Sans", sans-serif;
    font-size: var(--mk-letter-sz);
    font-weight: 400;
    justify-content: center;
    min-height: var(--mk-key-h);
    user-select: none;
  }
  .mk-key--letter { text-transform: lowercase; }
  .mk-key--fn {
    background: var(--mk-fn-bg);
    color: var(--mk-key-color);
    font-size: var(--mk-fn-sz);
    font-weight: 500;
  }
  .mk-key--space {
    background: var(--mk-key-bg);
    color: #5A6370;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 0.02em;
  }

  /* ── Home-bar nav pill ──────────────────────────────── */
  .mk-nav {
    align-items: center;
    display: flex;
    justify-content: center;
    padding: 8px 0 4px;
  }
  .mk-nav-pill {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 999px;
    height: 5px;
    width: 96px;
  }

  /* ── Version watermark ──────────────────────────────── */
  .mk-watermark {
    bottom: 3px;
    color: rgba(0, 0, 0, 0.22);
    font-family: ui-monospace, "SFMono-Regular", monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
    pointer-events: none;
    position: absolute;
    right: 10px;
    user-select: none;
  }

  /* ── Debug badge ────────────────────────────────────── */
  .mk-badge {
    background: rgba(16, 33, 57, 0.9);
    border-radius: 12px;
    color: #fff;
    font-family: ui-monospace, "SFMono-Regular", monospace;
    font-size: 11px;
    line-height: 1.4;
    max-width: 200px;
    opacity: 0;
    padding: 8px 10px;
    position: absolute;
    right: 12px;
    top: 12px;
    transform: translate3d(0, -8px, 0);
    transition: opacity 180ms ease, transform 180ms ease;
    white-space: pre-line;
    z-index: 10;
  }
  .mk-badge[data-visible="true"] { opacity: 1; transform: translate3d(0, 0, 0); }
`;
    class MockKeyboardController {
        state = { ...DEFAULT_KEYBOARD_STATE };
        activeEditable = null;
        overlay = null;
        blurTimer = null;
        viewportRafId = null;
        fallbackRafIds = [];
        rootStyleSnapshot = null;
        shiftedElements = new Set();
        shiftedSnapshots = new WeakMap();
        autoAnchoredCandidates = new Set();
        candidateCacheDirty = true;
        candidateObserver = null;
        debugFocused = new Set();
        debugShifted = new Set();
        debugStyle = null;
        bridgeReady = false;
        pendingBridgeDetail = null;
        lastDispatchedDetail = null;
        lastAutoScrollApplied = false;
        lastBodyPaddingApplied = false;
        listenersBound = false;
        destroyed = false;
        runtimeMessageListener = (message, _sender, sendResponse) => {
            if (message && message.type === 'SYNC_STATE') {
                this.syncState(message.state);
                return false;
            }
            if (message && message.type === 'GET_DEBUG_SNAPSHOT') {
                sendResponse(this.getDebugSnapshot());
                return false;
            }
            return false;
        };
        constructor() {
            if (!this.isExtensionContextAlive()) {
                return;
            }
            this.injectPageBridge();
            this.ensureDebugStyle();
            chrome.runtime.onMessage.addListener(this.runtimeMessageListener);
            this.bindGlobalListeners();
        }
        syncState(nextState) {
            if (this.destroyed) {
                return;
            }
            const previous = this.state;
            this.state = { ...this.state, ...nextState };
            if (!this.state.enabled) {
                this.disconnectCandidateObserver();
                this.state = {
                    ...this.state,
                    visible: false,
                    heightPx: 0,
                    activeSelector: null,
                    shiftedElementCount: 0
                };
                this.render(previous, 'disabled');
                return;
            }
            this.ensureOverlay();
            if (this.state.preferNativeViewport) {
                this.disconnectCandidateObserver();
            }
            else {
                this.ensureCandidateObserver();
            }
            this.recompute(this.sourceForCurrentMode());
        }
        bindGlobalListeners() {
            if (this.listenersBound || this.destroyed) {
                return;
            }
            this.listenersBound = true;
            document.addEventListener('focusin', this.onFocusIn, true);
            document.addEventListener('focusout', this.onFocusOut, true);
            window.addEventListener('resize', this.onViewportChange, { passive: true });
            window.addEventListener('scroll', this.onViewportChange, { passive: true });
            window.visualViewport?.addEventListener('resize', this.onViewportChange, { passive: true });
            window.visualViewport?.addEventListener('scroll', this.onViewportChange, { passive: true });
        }
        onFocusIn = (event) => {
            if (this.destroyed || !this.state.enabled) {
                return;
            }
            if (this.blurTimer !== null) {
                window.clearTimeout(this.blurTimer);
                this.blurTimer = null;
            }
            if (isEditableElement(event.target)) {
                this.activeEditable = event.target;
                this.recompute('auto-focus');
            }
        };
        onFocusOut = () => {
            if (this.destroyed || !this.state.enabled) {
                return;
            }
            if (this.blurTimer !== null) {
                window.clearTimeout(this.blurTimer);
            }
            this.blurTimer = window.setTimeout(() => {
                this.activeEditable = getCurrentEditable();
                this.recompute(this.sourceForCurrentMode());
            }, 120);
        };
        onViewportChange = () => {
            if (this.destroyed || !this.state.enabled) {
                return;
            }
            if (this.viewportRafId !== null) {
                return;
            }
            this.viewportRafId = window.requestAnimationFrame(() => {
                this.viewportRafId = null;
                this.recompute(this.sourceForCurrentMode());
            });
        };
        recompute(source) {
            if (this.destroyed) {
                return;
            }
            const previous = this.state;
            this.activeEditable = getCurrentEditable();
            const viewport = getViewportMetrics();
            const visible = deriveVisibility(this.state.visibilityMode, this.activeEditable);
            const heightPx = visible ? computeKeyboardHeight(this.state.preset, viewport.height) : 0;
            this.state = {
                ...this.state,
                visible,
                heightPx,
                activeSelector: describeElement(this.activeEditable)
            };
            if (previous.preset !== this.state.preset ||
                previous.visible !== this.state.visible ||
                previous.heightPx !== this.state.heightPx) {
                this.candidateCacheDirty = true;
            }
            this.render(previous, source);
        }
        render(previous, source) {
            if (this.destroyed) {
                return;
            }
            const stateChanged = previous.visible !== this.state.visible ||
                previous.heightPx !== this.state.heightPx ||
                previous.preset !== this.state.preset;
            this.ensureOverlay();
            this.positionOverlay();
            this.applyRootHooks();
            this.lastAutoScrollApplied = false;
            if (this.state.enabled && this.state.visible && !this.state.preferNativeViewport) {
                this.restoreGlobalCompensation();
                this.restoreShiftedElements();
            }
            else {
                this.cancelFallbackPass();
                this.restoreGlobalCompensation();
                this.restoreShiftedElements();
            }
            if (stateChanged) {
                this.dispatchChange(source);
            }
            if (this.state.enabled && this.state.visible && !this.state.preferNativeViewport) {
                this.scheduleFallbackPass();
            }
            this.updateDebugUI();
            if (this.overlay) {
                this.overlay.keyboard.setAttribute('data-preset', this.state.preset);
                this.overlay.keyboard.setAttribute('data-visible', String(this.state.enabled && this.state.visible));
                this.overlay.safeArea.setAttribute('data-visible', String(this.state.enabled && this.state.visible && this.state.debug));
                this.overlay.badge.setAttribute('data-visible', String(this.state.debug));
            }
            this.sendRuntimeState();
        }
        ensureOverlay() {
            if (this.overlay || this.destroyed) {
                return;
            }
            let host = document.getElementById(OVERLAY_HOST_ID);
            if (!host) {
                host = document.createElement('div');
                host.id = OVERLAY_HOST_ID;
                document.documentElement.append(host);
            }
            const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
            shadow.innerHTML = '';
            const style = document.createElement('style');
            style.textContent = OVERLAY_CSS;
            const root = document.createElement('div');
            root.className = 'mk-root';
            const safeArea = document.createElement('div');
            safeArea.className = 'mk-safe-area';
            const badge = document.createElement('div');
            badge.className = 'mk-badge';
            const keyboard = document.createElement('div');
            keyboard.className = 'mk-keyboard';
            keyboard.innerHTML = buildKeyboardMarkup();
            root.append(safeArea, badge, keyboard);
            shadow.append(style, root);
            this.overlay = { host, keyboard, safeArea, badge };
        }
        positionOverlay() {
            if (!this.overlay) {
                return;
            }
            const viewport = getViewportMetrics();
            const keyboardHeight = this.state.visible ? this.state.heightPx : 0;
            const keyboardTop = viewport.offsetTop + viewport.height - keyboardHeight;
            Object.assign(this.overlay.host.style, {
                inset: '0',
                left: '0',
                pointerEvents: 'none',
                position: 'fixed',
                top: '0',
                zIndex: '2147483647'
            });
            Object.assign(this.overlay.keyboard.style, {
                left: `${viewport.offsetLeft}px`,
                top: `${keyboardTop}px`,
                width: `${viewport.width}px`,
                height: `${keyboardHeight}px`
            });
            Object.assign(this.overlay.safeArea.style, {
                left: `${viewport.offsetLeft}px`,
                top: `${viewport.offsetTop}px`,
                width: `${viewport.width}px`,
                height: `${Math.max(0, viewport.height - keyboardHeight)}px`
            });
        }
        applyRootHooks() {
            const rootStyle = document.documentElement.style;
            setCssVar(rootStyle, '--mock-keyboard-height', `${this.state.heightPx}px`);
            setCssVar(rootStyle, '--mock-keyboard-inset-bottom', `${this.state.heightPx}px`);
            setCssVar(rootStyle, '--mock-keyboard-visible', this.state.visible ? '1' : '0');
            setCssVar(rootStyle, '--mock-keyboard-animation-ms', `${ANIMATION_MS}ms`);
            document.documentElement.setAttribute(ROOT_DATA_ATTRIBUTE, this.state.visible ? 'open' : 'closed');
        }
        applyGlobalCompensation() {
            if (!document.body) {
                return;
            }
            if (!this.rootStyleSnapshot) {
                this.rootStyleSnapshot = {
                    bodyPaddingBottom: document.body.style.paddingBottom,
                    htmlScrollPaddingBottom: document.documentElement.style.scrollPaddingBottom
                };
            }
            document.body.style.paddingBottom = `${this.state.heightPx}px`;
            document.documentElement.style.scrollPaddingBottom = `${this.state.heightPx}px`;
            this.lastBodyPaddingApplied = true;
        }
        restoreGlobalCompensation() {
            if (!document.body) {
                return;
            }
            if (!this.rootStyleSnapshot) {
                document.body.style.paddingBottom = '';
                document.documentElement.style.scrollPaddingBottom = '';
                this.lastBodyPaddingApplied = false;
                return;
            }
            document.body.style.paddingBottom = this.rootStyleSnapshot.bodyPaddingBottom;
            document.documentElement.style.scrollPaddingBottom =
                this.rootStyleSnapshot.htmlScrollPaddingBottom;
            this.rootStyleSnapshot = null;
            this.lastBodyPaddingApplied = false;
        }
        scheduleFallbackPass() {
            this.cancelFallbackPass();
            if (this.destroyed || !this.state.enabled || !this.state.visible) {
                return;
            }
            const firstFrame = window.requestAnimationFrame(() => {
                this.fallbackRafIds = this.fallbackRafIds.filter((id) => id !== firstFrame);
                const secondFrame = window.requestAnimationFrame(() => {
                    this.fallbackRafIds = this.fallbackRafIds.filter((id) => id !== secondFrame);
                    this.runFallbackPass();
                });
                this.fallbackRafIds.push(secondFrame);
            });
            this.fallbackRafIds.push(firstFrame);
        }
        cancelFallbackPass() {
            for (const id of this.fallbackRafIds) {
                window.cancelAnimationFrame(id);
            }
            this.fallbackRafIds = [];
        }
        runFallbackPass() {
            if (this.destroyed || !this.state.enabled || !this.state.visible) {
                return;
            }
            if (this.state.preferNativeViewport) {
                this.restoreGlobalCompensation();
                this.restoreShiftedElements();
                this.lastAutoScrollApplied = false;
                this.updateDebugUI();
                this.sendRuntimeState();
                return;
            }
            if (this.shouldApplyGlobalCompensation()) {
                this.applyGlobalCompensation();
            }
            else {
                this.restoreGlobalCompensation();
            }
            this.shiftBottomAnchoredElements();
            this.scrollFocusedElementIntoView();
            this.updateDebugUI();
            this.sendRuntimeState();
        }
        shouldApplyGlobalCompensation() {
            if (!this.state.visible || !this.activeEditable || hasViewportAnchoredAncestor(this.activeEditable)) {
                return false;
            }
            return getFocusedElementOverlap(this.activeEditable, this.state.heightPx) > 0 &&
                findScrollableAncestor(this.activeEditable) === null;
        }
        shiftBottomAnchoredElements() {
            this.restoreShiftedElements();
            if (!this.state.visible) {
                this.state = { ...this.state, shiftedElementCount: 0 };
                return;
            }
            if (this.candidateCacheDirty) {
                this.refreshAnchoredCandidates();
            }
            const viewport = getViewportMetrics();
            const keyboardTop = viewport.height - this.state.heightPx;
            const candidates = Array.from(this.autoAnchoredCandidates).filter((element) => {
                if (!element.isConnected) {
                    this.autoAnchoredCandidates.delete(element);
                    return false;
                }
                if (!isBottomAnchoredCandidate(element, viewport.height, this.overlay?.host ?? null)) {
                    return false;
                }
                const rect = element.getBoundingClientRect();
                return rect.bottom > keyboardTop + 8;
            });
            for (const element of candidates) {
                const snapshot = makeStyleSnapshot(element);
                this.shiftedSnapshots.set(element, snapshot);
                element.style.transition = snapshot.transition
                    ? `${snapshot.transition}, transform ${ANIMATION_MS}ms ease`
                    : `transform ${ANIMATION_MS}ms ease`;
                element.style.transform = mergeTransform(snapshot.transform, this.state.heightPx);
                this.shiftedElements.add(element);
            }
            this.state = { ...this.state, shiftedElementCount: candidates.length };
        }
        restoreShiftedElements() {
            for (const element of this.shiftedElements) {
                const snapshot = this.shiftedSnapshots.get(element);
                if (!snapshot) {
                    continue;
                }
                element.style.transform = snapshot.transform;
                element.style.transition = snapshot.transition;
                element.style.bottom = snapshot.bottom;
            }
            this.shiftedElements.clear();
            this.state = { ...this.state, shiftedElementCount: 0 };
        }
        scrollFocusedElementIntoView() {
            if (!this.state.visible || !this.activeEditable) {
                return;
            }
            if (hasViewportAnchoredAncestor(this.activeEditable)) {
                return;
            }
            const delta = getFocusedElementOverlap(this.activeEditable, this.state.heightPx);
            if (delta <= 0) {
                return;
            }
            const scrollParent = findScrollableAncestor(this.activeEditable);
            if (scrollParent) {
                this.lastAutoScrollApplied = true;
                scrollParent.scrollBy({ top: delta, behavior: 'auto' });
                return;
            }
            this.lastAutoScrollApplied = true;
            window.scrollBy({ top: delta, behavior: 'auto' });
        }
        dispatchChange(source) {
            if (this.destroyed) {
                return;
            }
            const viewport = getViewportMetrics();
            const detail = {
                visible: this.state.visible,
                heightPx: this.state.heightPx,
                preset: this.state.preset,
                source,
                viewportWidthPx: viewport.width,
                viewportHeightPx: viewport.height,
                viewportOffsetTopPx: viewport.offsetTop,
                viewportOffsetLeftPx: viewport.offsetLeft
            };
            this.lastDispatchedDetail = detail;
            if (this.bridgeReady) {
                document.dispatchEvent(new CustomEvent(CONTENT_BRIDGE_EVENT_NAME, { detail }));
                return;
            }
            this.pendingBridgeDetail = detail;
        }
        updateDebugUI() {
            if (!this.overlay || this.destroyed) {
                return;
            }
            if (!this.state.debug) {
                this.clearDebugMarks();
                this.overlay.badge.textContent = '';
                return;
            }
            const viewport = getViewportMetrics();
            this.clearDebugMarks();
            if (this.activeEditable) {
                this.activeEditable.dataset.mockKeyboardDebugFocused = 'true';
                this.debugFocused.add(this.activeEditable);
            }
            for (const element of this.shiftedElements) {
                element.dataset.mockKeyboardDebugShifted = 'true';
                this.debugShifted.add(element);
            }
            this.overlay.badge.textContent = [
                `visible: ${this.state.visible}`,
                `height: ${this.state.heightPx}px`,
                `preset: ${this.state.preset}`,
                `native: ${this.state.preferNativeViewport}`,
                `shifted: ${this.state.shiftedElementCount}`,
                `offset: ${computeKeyboardOffsetFormulaPx()}px`,
                `vv: ${viewport.height.toFixed(0)}h / ${viewport.width.toFixed(0)}w`,
                `ih: ${window.innerHeight}px`,
                `src: ${this.state.visibilityMode}`
            ].join('\n');
        }
        clearDebugMarks() {
            for (const element of this.debugFocused) {
                delete element.dataset.mockKeyboardDebugFocused;
            }
            for (const element of this.debugShifted) {
                delete element.dataset.mockKeyboardDebugShifted;
            }
            this.debugFocused.clear();
            this.debugShifted.clear();
        }
        ensureDebugStyle() {
            if (this.debugStyle || this.destroyed) {
                return;
            }
            this.debugStyle = document.createElement('style');
            this.debugStyle.textContent = `
      [data-mock-keyboard-debug-focused="true"] {
        outline: 2px solid #ff6f1a !important;
        outline-offset: 2px !important;
      }
      [data-mock-keyboard-debug-shifted="true"] {
        outline: 2px solid #1890ff !important;
        outline-offset: 2px !important;
      }
    `;
            document.documentElement.append(this.debugStyle);
        }
        injectPageBridge() {
            if (this.destroyed) {
                return;
            }
            if (document.documentElement.getAttribute(PAGE_BRIDGE_READY_ATTRIBUTE) === 'ready') {
                this.bridgeReady = true;
                if (this.pendingBridgeDetail) {
                    document.dispatchEvent(new CustomEvent(CONTENT_BRIDGE_EVENT_NAME, { detail: this.pendingBridgeDetail }));
                    this.pendingBridgeDetail = null;
                }
                return;
            }
            if (pageWindow.__mockKeyboardBridgeInjected__) {
                return;
            }
            const script = document.createElement('script');
            const bridgeUrl = this.safeGetRuntimeUrl('page-bridge.js');
            if (!bridgeUrl) {
                return;
            }
            script.src = bridgeUrl;
            script.async = false;
            script.addEventListener('load', () => {
                this.bridgeReady = true;
                if (this.pendingBridgeDetail) {
                    document.dispatchEvent(new CustomEvent(CONTENT_BRIDGE_EVENT_NAME, { detail: this.pendingBridgeDetail }));
                    this.pendingBridgeDetail = null;
                }
                script.remove();
            });
            script.addEventListener('error', () => {
                const detail = this.pendingBridgeDetail;
                this.pendingBridgeDetail = null;
                if (detail) {
                    window.dispatchEvent(new CustomEvent(CONTENT_PUBLIC_EVENT_NAME, { detail }));
                }
                script.remove();
            });
            (document.head ?? document.documentElement).append(script);
            pageWindow.__mockKeyboardBridgeInjected__ = true;
        }
        getDebugSnapshot() {
            const contentViewport = getViewportMetrics();
            return {
                bridgeInjected: pageWindow.__mockKeyboardBridgeInjected__ ||
                    document.documentElement.getAttribute(PAGE_BRIDGE_READY_ATTRIBUTE) === 'ready',
                bridgeReady: this.bridgeReady,
                pendingBridgeEvent: this.pendingBridgeDetail !== null,
                preferNativeViewport: this.state.preferNativeViewport,
                visible: this.state.visible,
                heightPx: this.state.heightPx,
                preset: this.state.preset,
                visibilityMode: this.state.visibilityMode,
                activeSelector: this.state.activeSelector,
                shiftedElementCount: this.state.shiftedElementCount,
                contentViewport,
                contentInnerHeight: window.innerHeight,
                contentInnerWidth: window.innerWidth,
                keyboardOffsetFormulaPx: computeKeyboardOffsetFormulaPx(),
                fallback: {
                    scheduled: this.fallbackRafIds.length > 0,
                    bodyPaddingApplied: this.lastBodyPaddingApplied,
                    shiftedElementsApplied: this.shiftedElements.size > 0,
                    autoScrollApplied: this.lastAutoScrollApplied,
                    focusedOverlapPx: this.activeEditable && this.state.visible
                        ? getFocusedElementOverlap(this.activeEditable, this.state.heightPx)
                        : 0,
                    focusedAnchored: hasViewportAnchoredAncestor(this.activeEditable)
                },
                lastChange: this.lastDispatchedDetail,
                page: readPageDebugSnapshot()
            };
        }
        ensureCandidateObserver() {
            if (this.candidateObserver) {
                return;
            }
            this.candidateObserver = new MutationObserver(() => {
                this.candidateCacheDirty = true;
            });
            this.candidateObserver.observe(document.documentElement, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['style', 'class', ANCHOR_ATTRIBUTE, IGNORE_ATTRIBUTE]
            });
        }
        disconnectCandidateObserver() {
            this.candidateObserver?.disconnect();
            this.candidateObserver = null;
            this.autoAnchoredCandidates.clear();
            this.candidateCacheDirty = true;
        }
        refreshAnchoredCandidates() {
            this.autoAnchoredCandidates.clear();
            const bodyElements = document.querySelectorAll('body *');
            for (const element of bodyElements) {
                this.autoAnchoredCandidates.add(element);
            }
            const explicitAnchors = document.querySelectorAll(`[${ANCHOR_ATTRIBUTE}="bottom"]`);
            for (const element of explicitAnchors) {
                this.autoAnchoredCandidates.add(element);
            }
            this.candidateCacheDirty = false;
        }
        sourceForCurrentMode() {
            if (!this.state.enabled) {
                return 'disabled';
            }
            if (this.state.visibilityMode === 'force-closed') {
                return 'forced-closed';
            }
            if (this.state.visibilityMode === 'force-open') {
                return 'manual';
            }
            return 'auto-focus';
        }
        sendRuntimeState() {
            if (!this.isExtensionContextAlive()) {
                this.destroy();
                return;
            }
            try {
                void chrome.runtime
                    .sendMessage({
                    type: 'CONTENT_STATE',
                    tabId: 0,
                    state: this.state
                })
                    .catch((error) => {
                    if (isContextInvalidationError(error)) {
                        this.destroy();
                    }
                });
            }
            catch (error) {
                if (isContextInvalidationError(error)) {
                    this.destroy();
                }
            }
        }
        safeGetRuntimeUrl(path) {
            if (!this.isExtensionContextAlive()) {
                this.destroy();
                return null;
            }
            try {
                return chrome.runtime.getURL(path);
            }
            catch (error) {
                if (isContextInvalidationError(error)) {
                    this.destroy();
                    return null;
                }
                throw error;
            }
        }
        isExtensionContextAlive() {
            try {
                return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
            }
            catch {
                return false;
            }
        }
        destroy() {
            if (this.destroyed) {
                return;
            }
            this.destroyed = true;
            this.state = {
                ...this.state,
                enabled: false,
                visible: false,
                heightPx: 0,
                activeSelector: null,
                shiftedElementCount: 0
            };
            if (this.blurTimer !== null) {
                window.clearTimeout(this.blurTimer);
                this.blurTimer = null;
            }
            if (this.viewportRafId !== null) {
                window.cancelAnimationFrame(this.viewportRafId);
                this.viewportRafId = null;
            }
            this.cancelFallbackPass();
            if (this.listenersBound) {
                document.removeEventListener('focusin', this.onFocusIn, true);
                document.removeEventListener('focusout', this.onFocusOut, true);
                window.removeEventListener('resize', this.onViewportChange);
                window.removeEventListener('scroll', this.onViewportChange);
                window.visualViewport?.removeEventListener('resize', this.onViewportChange);
                window.visualViewport?.removeEventListener('scroll', this.onViewportChange);
                this.listenersBound = false;
            }
            try {
                if (this.isExtensionContextAlive()) {
                    chrome.runtime.onMessage.removeListener(this.runtimeMessageListener);
                }
            }
            catch {
                // Ignore teardown errors after context invalidation.
            }
            this.disconnectCandidateObserver();
            this.restoreGlobalCompensation();
            this.restoreShiftedElements();
            this.clearDebugMarks();
            this.resetRootHooks();
            this.debugStyle?.remove();
            this.debugStyle = null;
            if (this.overlay) {
                this.overlay.host.remove();
                this.overlay = null;
            }
        }
        resetRootHooks() {
            const rootStyle = document.documentElement.style;
            rootStyle.removeProperty('--mock-keyboard-height');
            rootStyle.removeProperty('--mock-keyboard-inset-bottom');
            rootStyle.removeProperty('--mock-keyboard-visible');
            rootStyle.removeProperty('--mock-keyboard-animation-ms');
            document.documentElement.setAttribute(ROOT_DATA_ATTRIBUTE, 'closed');
        }
    }
    function computeKeyboardHeight(preset, viewportHeight) {
        const configs = {
            'android-compact': [240, 0.34, 300],
            'android-standard': [260, 0.38, 340],
            'android-tall': [280, 0.42, 380]
        };
        const [min, ratio, max] = configs[preset];
        return Math.min(Math.max(Math.round(viewportHeight * ratio), min), max);
    }
    function deriveVisibility(visibilityMode, activeEditable) {
        if (visibilityMode === 'force-open') {
            return true;
        }
        if (visibilityMode === 'force-closed') {
            return false;
        }
        return Boolean(activeEditable);
    }
    function getViewportMetrics() {
        const viewport = window.visualViewport;
        if (!viewport) {
            return {
                width: window.innerWidth,
                height: window.innerHeight,
                offsetTop: 0,
                offsetLeft: 0
            };
        }
        return {
            width: viewport.width,
            height: viewport.height,
            offsetTop: viewport.offsetTop,
            offsetLeft: viewport.offsetLeft
        };
    }
    function readPageDebugSnapshot() {
        const debugNode = document.getElementById(PAGE_DEBUG_NODE_ID);
        if (!debugNode?.textContent) {
            return null;
        }
        try {
            return JSON.parse(debugNode.textContent);
        }
        catch {
            return null;
        }
    }
    function isEditableElement(node) {
        if (!(node instanceof HTMLElement)) {
            return false;
        }
        if (node.matches('[contenteditable]:not([contenteditable="false"])')) {
            return true;
        }
        if (node instanceof HTMLTextAreaElement) {
            return !node.readOnly && !node.disabled;
        }
        if (node instanceof HTMLInputElement) {
            return !node.readOnly && !node.disabled && !NON_TEXT_INPUT_TYPES.has(node.type.toLowerCase());
        }
        return false;
    }
    function getCurrentEditable() {
        return isEditableElement(document.activeElement) ? document.activeElement : null;
    }
    function describeElement(element) {
        if (!element) {
            return null;
        }
        if (element.id) {
            return `#${element.id}`;
        }
        if (element instanceof HTMLInputElement && element.name) {
            return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
        }
        const classes = Array.from(element.classList).slice(0, 2);
        if (classes.length > 0) {
            return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
        }
        return element.tagName.toLowerCase();
    }
    function isBottomAnchoredCandidate(element, viewportHeight, overlayHost) {
        if (overlayHost && overlayHost.contains(element)) {
            return false;
        }
        if (element.getAttribute(IGNORE_ATTRIBUTE) === 'true') {
            return false;
        }
        if (element.getAttribute(ANCHOR_ATTRIBUTE) === 'bottom') {
            return true;
        }
        const styles = window.getComputedStyle(element);
        if (!['fixed', 'sticky'].includes(styles.position)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && Math.abs(viewportHeight - rect.bottom) <= 24;
    }
    function findScrollableAncestor(element) {
        let current = element?.parentElement ?? null;
        while (current) {
            const styles = window.getComputedStyle(current);
            if (/(auto|scroll|overlay)/.test(styles.overflowY) && current.scrollHeight > current.clientHeight) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }
    function getFocusedElementOverlap(element, keyboardHeight) {
        const viewport = getViewportMetrics();
        const rect = element.getBoundingClientRect();
        const safeBottom = viewport.height - keyboardHeight - 12;
        return Math.max(0, rect.bottom - safeBottom);
    }
    function computeKeyboardOffsetFormulaPx() {
        return Math.max(0, Math.round(window.innerHeight -
            (window.visualViewport?.height ?? window.innerHeight) -
            (window.visualViewport?.offsetTop ?? 0)));
    }
    function hasViewportAnchoredAncestor(element) {
        let current = element;
        while (current) {
            if (current.getAttribute(ANCHOR_ATTRIBUTE) === 'bottom') {
                return true;
            }
            const styles = window.getComputedStyle(current);
            if (styles.position === 'fixed' || styles.position === 'sticky') {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }
    function makeStyleSnapshot(element) {
        return {
            transform: element.style.transform,
            transition: element.style.transition,
            bottom: element.style.bottom
        };
    }
    function mergeTransform(existingTransform, keyboardHeight) {
        const shift = `translate3d(0, -${keyboardHeight}px, 0)`;
        const trimmed = existingTransform.trim();
        return trimmed && trimmed !== 'none' ? `${trimmed} ${shift}` : shift;
    }
    function setCssVar(style, name, value) {
        style.setProperty(name, value);
    }
    function isContextInvalidationError(error) {
        return error instanceof Error && /Extension context invalidated/i.test(error.message);
    }
    function buildKeyboardMarkup() {
        // SVG icons matching Gboard's Material Design icon set
        const SHIFT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 1.5 13.5H8v8h8v-8h6.5z"/></svg>`;
        const BACKSPACE = `<svg width="22" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>`;
        const ENTER = `<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7h-2z"/></svg>`;
        const GLOBE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>`;
        const MIC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>`;
        const EXPAND = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z"/></svg>`;
        const lk = (ch) => `<span class="mk-key mk-key--letter">${ch}</span>`;
        const fk = (label) => `<span class="mk-key mk-key--fn">${label}</span>`;
        const row1 = 'qwertyuiop'.split('').map(lk).join('');
        const row2 = 'asdfghjkl'.split('').map(lk).join('');
        const row3 = `${fk(SHIFT)}${'zxcvbnm'.split('').map(lk).join('')}${fk(BACKSPACE)}`;
        // Bottom row: ?123 and enter are fn-colored; comma, period, space are letter-colored
        const row4 = [
            fk('?123'),
            lk(','),
            fk(GLOBE),
            `<span class="mk-key mk-key--space">English</span>`,
            lk('.'),
            fk(ENTER)
        ].join('');
        return `
    <div class="mk-suggestion-strip">
      <div class="mk-strip-icon">${MIC}</div>
      <div class="mk-strip-divider"></div>
      <div class="mk-suggestion">would</div>
      <div class="mk-strip-divider"></div>
      <div class="mk-suggestion">could</div>
      <div class="mk-strip-divider"></div>
      <div class="mk-suggestion">should</div>
      <div class="mk-strip-divider"></div>
      <div class="mk-strip-icon">${EXPAND}</div>
    </div>
    <div class="mk-rows">
      <div class="mk-row">${row1}</div>
      <div class="mk-row mk-row--offset">${row2}</div>
      <div class="mk-row mk-row--shift">${row3}</div>
      <div class="mk-row mk-row--bottom">${row4}</div>
    </div>
    <div class="mk-nav"><div class="mk-nav-pill"></div></div>
    <div class="mk-watermark">v0.2.0</div>
  `;
    }
    if (!pageWindow.__mockKeyboardController__) {
        pageWindow.__mockKeyboardController__ = new MockKeyboardController();
    }
})();
