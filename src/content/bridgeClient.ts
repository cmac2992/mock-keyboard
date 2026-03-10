import type { MockKeyboardChangeDetail, PageDebugSnapshot } from '../shared/types';
import {
  BRIDGE_CONTROL_EVENT,
  BRIDGE_DEBUG_NODE_ID,
  BRIDGE_KEYBOARD_EVENT,
  BRIDGE_READY_ATTRIBUTE,
  KEYBOARD_CHANGE_EVENT
} from '../shared/constants';

export interface BridgeWindow extends Window {
  __mockKeyboardBridgeInjected__?: boolean;
}

export interface BridgeDebugState {
  bridgeInjected: boolean;
  bridgeReady: boolean;
  pendingBridgeEvent: boolean;
  lastChange: MockKeyboardChangeDetail | null;
}

// Manages the lifecycle of the page bridge script (page-bridge.js).
// The bridge runs in the page's main JS world so it can patch window.innerHeight
// and fire the public `mockkeyboardchange` event that app code listens to.
export class PageBridgeClient {
  private bridgeReady = false;
  private pendingDetail: MockKeyboardChangeDetail | null = null;
  private lastDetail: MockKeyboardChangeDetail | null = null;

  constructor(
    private readonly pageWindow: BridgeWindow,
    private readonly getRuntimeUrl: (path: string) => string | null
  ) {}

  ensureInjected(): void {
    if (document.documentElement.getAttribute(BRIDGE_READY_ATTRIBUTE) === 'ready') {
      this.bridgeReady = true;
      this.flushPendingDetail();
      return;
    }

    if (this.pageWindow.__mockKeyboardBridgeInjected__) {
      return;
    }

    const bridgeUrl = this.getRuntimeUrl('page-bridge.js');
    if (!bridgeUrl) {
      return;
    }

    const script = document.createElement('script');
    script.src = bridgeUrl;
    script.async = false;
    script.addEventListener('load', () => {
      this.bridgeReady = true;
      this.flushPendingDetail();
      script.remove();
    });
    script.addEventListener('error', () => {
      // If the bridge fails to load, dispatch the public event directly as a fallback.
      const detail = this.pendingDetail;
      this.pendingDetail = null;
      if (detail) {
        window.dispatchEvent(new CustomEvent(KEYBOARD_CHANGE_EVENT, { detail }));
      }
      script.remove();
    });
    (document.head ?? document.documentElement).append(script);
    this.pageWindow.__mockKeyboardBridgeInjected__ = true;
  }

  dispatch(detail: MockKeyboardChangeDetail): void {
    this.lastDetail = detail;

    if (this.bridgeReady) {
      document.dispatchEvent(new CustomEvent(BRIDGE_KEYBOARD_EVENT, { detail }));
      return;
    }

    // Bridge is still loading — hold the detail and flush it once the script is ready.
    this.pendingDetail = detail;
  }

  teardown(): void {
    this.bridgeReady = false;
    this.pendingDetail = null;
    document.dispatchEvent(
      new CustomEvent(BRIDGE_CONTROL_EVENT, { detail: { type: 'teardown' } })
    );
    document.getElementById(BRIDGE_DEBUG_NODE_ID)?.remove();
    document.documentElement.removeAttribute(BRIDGE_READY_ATTRIBUTE);
    this.pageWindow.__mockKeyboardBridgeInjected__ = false;
  }

  getDebugState(): BridgeDebugState {
    return {
      bridgeInjected:
        Boolean(this.pageWindow.__mockKeyboardBridgeInjected__) ||
        document.documentElement.getAttribute(BRIDGE_READY_ATTRIBUTE) === 'ready',
      bridgeReady: this.bridgeReady,
      pendingBridgeEvent: this.pendingDetail !== null,
      lastChange: this.lastDetail
    };
  }

  readPageDebugSnapshot(): PageDebugSnapshot | null {
    const debugNode = document.getElementById(BRIDGE_DEBUG_NODE_ID);
    if (!debugNode?.textContent) {
      return null;
    }

    try {
      return JSON.parse(debugNode.textContent) as PageDebugSnapshot;
    } catch {
      return null;
    }
  }

  private flushPendingDetail(): void {
    if (!this.pendingDetail) {
      return;
    }

    document.dispatchEvent(new CustomEvent(BRIDGE_KEYBOARD_EVENT, { detail: this.pendingDetail }));
    this.pendingDetail = null;
  }
}
