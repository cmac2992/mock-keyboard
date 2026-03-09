import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { KeyboardOverlay } from './KeyboardOverlay';
import type { KeyboardOverlayDebugModel } from './KeyboardOverlay';
import { buildOverlayDebugModel, buildOverlayProps } from './overlayState';
import { PageBridgeClient, type BridgeWindow } from './bridgeClient';
import {
  ANIMATION_MS,
  DEFAULT_KEYBOARD_STATE,
  OVERLAY_HOST_ID,
  ROOT_DATA_ATTRIBUTE
} from '../shared/constants';
import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  KeyboardDebugSnapshot,
  KeyboardState,
  MockKeyboardChangeDetail
} from '../shared/types';
import {
  computeKeyboardHeight,
  computeKeyboardOffsetFormulaPx,
  deriveVisibility,
  describeElement,
  getViewportMetrics,
  isEditableElement,
  setCssVar
} from '../shared/utils';

type KeyboardSource = MockKeyboardChangeDetail['source'];

interface OverlayElements {
  host: HTMLDivElement;
  reactRoot: Root;
}

export type PageWindow = BridgeWindow &
  typeof globalThis & {
    __mockKeyboardController__?: MockKeyboardController;
  };

// The controller coordinates the tab lifecycle. Rendering and bridge plumbing now
// live in smaller helpers so this file can stay focused on state transitions.
export class MockKeyboardController {
  private state: KeyboardState = { ...DEFAULT_KEYBOARD_STATE };
  private activeEditable: HTMLElement | null = null;
  private overlay: OverlayElements | null = null;
  private blurTimer: number | null = null;
  private viewportRafId: number | null = null;
  private debugFocused = new Set<HTMLElement>();
  private debugStyle: HTMLStyleElement | null = null;
  private listenersBound = false;
  private destroyed = false;
  private readonly pageWindow = window as PageWindow;
  private readonly bridgeClient = new PageBridgeClient(
    this.pageWindow,
    this.safeGetRuntimeUrl.bind(this)
  );

  private readonly runtimeMessageListener = (
    message: BackgroundToContentMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: KeyboardDebugSnapshot) => void
  ) => {
    if (message.type === 'SYNC_STATE') {
      this.syncState(message.state);
      return false;
    }

    if (message.type === 'GET_DEBUG_SNAPSHOT') {
      sendResponse(this.getDebugSnapshot());
    }

    return false;
  };

  constructor() {
    if (!this.isExtensionContextAlive()) {
      return;
    }

    this.bridgeClient.ensureInjected();
    this.ensureDebugStyle();
    chrome.runtime.onMessage.addListener(this.runtimeMessageListener);
    this.bindGlobalListeners();
  }

  syncState(nextState: KeyboardState): void {
    if (this.destroyed) {
      return;
    }

    const previous = this.state;
    this.state = { ...this.state, ...nextState };

    if (!this.state.enabled) {
      this.state = {
        ...this.state,
        visible: false,
        heightPx: 0,
        activeSelector: null
      };
      this.render(previous, 'disabled');
      this.destroy();
      return;
    }

    this.ensureOverlay();
    this.recompute(this.getCurrentSource());
  }

  private bindGlobalListeners(): void {
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

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (this.destroyed || !this.state.enabled) {
      return;
    }

    if (this.blurTimer !== null) {
      window.clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }

    if (isEditableElement(event.target as Element | null)) {
      this.activeEditable = event.target as HTMLElement;
      this.recompute('auto-focus');
    }
  };

  private readonly onFocusOut = (): void => {
    if (this.destroyed || !this.state.enabled) {
      return;
    }

    if (this.blurTimer !== null) {
      window.clearTimeout(this.blurTimer);
    }

    this.blurTimer = window.setTimeout(() => {
      this.activeEditable = getCurrentEditable();
      this.recompute(this.getCurrentSource());
    }, 120);
  };

  private readonly onViewportChange = (): void => {
    if (this.destroyed || !this.state.enabled || this.viewportRafId !== null) {
      return;
    }

    this.viewportRafId = window.requestAnimationFrame(() => {
      this.viewportRafId = null;
      this.recompute(this.getCurrentSource());
    });
  };

  private recompute(source: KeyboardSource): void {
    if (this.destroyed) {
      return;
    }

    const previous = this.state;
    const viewport = getViewportMetrics(window);
    this.activeEditable = getCurrentEditable();
    const visible = deriveVisibility(this.state.visibilityMode, this.activeEditable);

    this.state = {
      ...this.state,
      visible,
      heightPx: visible ? computeKeyboardHeight(this.state.preset, viewport.height) : 0,
      activeSelector: describeElement(this.activeEditable)
    };

    this.render(previous, source);
  }

  private render(previous: KeyboardState, source: KeyboardSource): void {
    if (this.destroyed) {
      return;
    }

    this.ensureOverlay();
    this.applyRootHooks();

    if (didKeyboardGeometryChange(previous, this.state)) {
      this.dispatchChange(source);
    }

    this.renderOverlay();
    this.sendRuntimeState();
  }

  private ensureOverlay(): void {
    if (this.overlay || this.destroyed) {
      return;
    }

    const host = this.createOverlayHost();
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    const stylesheetUrl = this.safeGetRuntimeUrl('overlay.css');
    if (!stylesheetUrl) {
      return;
    }

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = stylesheetUrl;

    const mount = document.createElement('div');
    shadow.append(styleLink, mount);

    const reactRoot = createRoot(mount);
    flushSync(() => {
      reactRoot.render(createElement(KeyboardOverlay, buildOverlayProps(this.state, getViewportMetrics(window), null)));
    });

    this.overlay = { host, reactRoot };
  }

  private createOverlayHost(): HTMLDivElement {
    let host = document.getElementById(OVERLAY_HOST_ID) as HTMLDivElement | null;
    if (!host) {
      host = document.createElement('div');
      host.id = OVERLAY_HOST_ID;
      document.documentElement.append(host);
    }

    Object.assign(host.style, {
      inset: '0',
      left: '0',
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      zIndex: '2147483647'
    });

    return host;
  }

  private renderOverlay(): void {
    if (!this.overlay) {
      return;
    }

    const viewport = getViewportMetrics(window);
    const badgeModel = this.state.debug ? buildOverlayDebugModel(this.state, viewport, window) : null;

    this.clearDebugMarks();
    if (this.state.debug && this.activeEditable) {
      this.activeEditable.dataset.mockKeyboardDebugFocused = 'true';
      this.debugFocused.add(this.activeEditable);
    }

    this.overlay.reactRoot.render(
      createElement(KeyboardOverlay, buildOverlayProps(this.state, viewport, badgeModel))
    );
  }

  private applyRootHooks(): void {
    const rootStyle = document.documentElement.style;
    setCssVar(rootStyle, '--mock-keyboard-height', `${this.state.heightPx}px`);
    setCssVar(rootStyle, '--mock-keyboard-inset-bottom', `${this.state.heightPx}px`);
    setCssVar(rootStyle, '--mock-keyboard-visible', this.state.visible ? '1' : '0');
    setCssVar(rootStyle, '--mock-keyboard-animation-ms', `${ANIMATION_MS}ms`);
    document.documentElement.setAttribute(ROOT_DATA_ATTRIBUTE, this.state.visible ? 'open' : 'closed');
  }

  private dispatchChange(source: KeyboardSource): void {
    if (this.destroyed) {
      return;
    }

    const viewport = getViewportMetrics(window);
    this.bridgeClient.dispatch({
      visible: this.state.visible,
      heightPx: this.state.heightPx,
      preset: this.state.preset,
      source,
      viewportWidthPx: viewport.width,
      viewportHeightPx: viewport.height,
      viewportOffsetTopPx: viewport.offsetTop,
      viewportOffsetLeftPx: viewport.offsetLeft
    });
  }

  private getDebugSnapshot(): KeyboardDebugSnapshot {
    const bridgeState = this.bridgeClient.getDebugState();
    return {
      ...bridgeState,
      visible: this.state.visible,
      heightPx: this.state.heightPx,
      preset: this.state.preset,
      visibilityMode: this.state.visibilityMode,
      activeSelector: this.state.activeSelector,
      contentViewport: getViewportMetrics(window),
      contentInnerHeight: window.innerHeight,
      contentInnerWidth: window.innerWidth,
      keyboardOffsetFormulaPx: computeKeyboardOffsetFormulaPx(window),
      page: this.bridgeClient.readPageDebugSnapshot()
    };
  }

  private getCurrentSource(): KeyboardSource {
    if (!this.state.enabled) {
      return 'disabled';
    }

    if (this.state.visibilityMode === 'force-closed') {
      return 'forced-closed';
    }

    return this.state.visibilityMode === 'force-open' ? 'manual' : 'auto-focus';
  }

  private sendRuntimeState(): void {
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
        } satisfies ContentToBackgroundMessage)
        .catch((error: unknown) => {
          if (isContextInvalidationError(error)) {
            this.destroy();
          }
        });
    } catch (error) {
      if (isContextInvalidationError(error)) {
        this.destroy();
      }
    }
  }

  private safeGetRuntimeUrl(path: string): string | null {
    if (!this.isExtensionContextAlive()) {
      this.destroy();
      return null;
    }

    try {
      return chrome.runtime.getURL(path);
    } catch (error) {
      if (isContextInvalidationError(error)) {
        this.destroy();
        return null;
      }
      throw error;
    }
  }

  private isExtensionContextAlive(): boolean {
    try {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  private ensureDebugStyle(): void {
    if (this.debugStyle || this.destroyed) {
      return;
    }

    this.debugStyle = document.createElement('style');
    this.debugStyle.textContent = `
      [data-mock-keyboard-debug-focused="true"] {
        outline: 2px solid #ff6f1a !important;
        outline-offset: 2px !important;
      }
    `;
    document.documentElement.append(this.debugStyle);
  }

  private clearDebugMarks(): void {
    for (const element of this.debugFocused) {
      delete element.dataset.mockKeyboardDebugFocused;
    }
    this.debugFocused.clear();
  }

  private resetRootHooks(): void {
    const rootStyle = document.documentElement.style;
    rootStyle.removeProperty('--mock-keyboard-height');
    rootStyle.removeProperty('--mock-keyboard-inset-bottom');
    rootStyle.removeProperty('--mock-keyboard-visible');
    rootStyle.removeProperty('--mock-keyboard-animation-ms');
    document.documentElement.setAttribute(ROOT_DATA_ATTRIBUTE, 'closed');
  }

  private destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.state = {
      ...this.state,
      enabled: false,
      visible: false,
      heightPx: 0,
      activeSelector: null
    };

    if (this.blurTimer !== null) {
      window.clearTimeout(this.blurTimer);
    }

    if (this.viewportRafId !== null) {
      window.cancelAnimationFrame(this.viewportRafId);
    }

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
    } catch {
      // Ignore teardown errors after context invalidation.
    }

    this.clearDebugMarks();
    this.resetRootHooks();
    this.bridgeClient.teardown();
    this.debugStyle?.remove();
    this.debugStyle = null;

    if (this.overlay) {
      this.overlay.reactRoot.unmount();
      this.overlay.host.remove();
      this.overlay = null;
    }

    delete this.pageWindow.__mockKeyboardController__;
  }
}

function didKeyboardGeometryChange(previous: KeyboardState, next: KeyboardState): boolean {
  return (
    previous.visible !== next.visible ||
    previous.heightPx !== next.heightPx ||
    previous.preset !== next.preset
  );
}

function getCurrentEditable(): HTMLElement | null {
  return isEditableElement(document.activeElement) ? document.activeElement : null;
}

function isContextInvalidationError(error: unknown): boolean {
  return error instanceof Error && /Extension context invalidated/i.test(error.message);
}
