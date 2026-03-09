import type { MockKeyboardChangeDetail, PageDebugSnapshot } from '../shared/types';

const CONTENT_BRIDGE_EVENT_NAME = '__mockkeyboardbridge';
const CONTENT_BRIDGE_CONTROL_EVENT_NAME = '__mockkeyboardbridgecontrol';
const CONTENT_PUBLIC_EVENT_NAME = 'mockkeyboardchange';
const PAGE_BRIDGE_READY_ATTRIBUTE = 'data-mock-keyboard-bridge';
const PAGE_DEBUG_NODE_ID = '__mock-keyboard-page-debug';

export interface BridgeWindow extends Window {
  __mockKeyboardBridgeInjected__?: boolean;
}

export interface BridgeDebugState {
  bridgeInjected: boolean;
  bridgeReady: boolean;
  pendingBridgeEvent: boolean;
  lastChange: MockKeyboardChangeDetail | null;
}

// This wrapper hides the page-bridge lifecycle so the content controller can stay
// focused on keyboard state rather than script-tag bookkeeping.
export class PageBridgeClient {
  private bridgeReady = false;
  private pendingDetail: MockKeyboardChangeDetail | null = null;
  private lastDetail: MockKeyboardChangeDetail | null = null;

  constructor(
    private readonly pageWindow: BridgeWindow,
    private readonly getRuntimeUrl: (path: string) => string | null
  ) {}

  ensureInjected(): void {
    if (document.documentElement.getAttribute(PAGE_BRIDGE_READY_ATTRIBUTE) === 'ready') {
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
      const detail = this.pendingDetail;
      this.pendingDetail = null;
      if (detail) {
        window.dispatchEvent(new CustomEvent(CONTENT_PUBLIC_EVENT_NAME, { detail }));
      }
      script.remove();
    });
    (document.head ?? document.documentElement).append(script);
    this.pageWindow.__mockKeyboardBridgeInjected__ = true;
  }

  dispatch(detail: MockKeyboardChangeDetail): void {
    this.lastDetail = detail;

    if (this.bridgeReady) {
      document.dispatchEvent(new CustomEvent(CONTENT_BRIDGE_EVENT_NAME, { detail }));
      return;
    }

    this.pendingDetail = detail;
  }

  teardown(): void {
    this.bridgeReady = false;
    this.pendingDetail = null;
    document.dispatchEvent(
      new CustomEvent(CONTENT_BRIDGE_CONTROL_EVENT_NAME, { detail: { type: 'teardown' } })
    );
    document.getElementById(PAGE_DEBUG_NODE_ID)?.remove();
    document.documentElement.removeAttribute(PAGE_BRIDGE_READY_ATTRIBUTE);
    this.pageWindow.__mockKeyboardBridgeInjected__ = false;
  }

  getDebugState(): BridgeDebugState {
    return {
      bridgeInjected:
        Boolean(this.pageWindow.__mockKeyboardBridgeInjected__) ||
        document.documentElement.getAttribute(PAGE_BRIDGE_READY_ATTRIBUTE) === 'ready',
      bridgeReady: this.bridgeReady,
      pendingBridgeEvent: this.pendingDetail !== null,
      lastChange: this.lastDetail
    };
  }

  readPageDebugSnapshot(): PageDebugSnapshot | null {
    const debugNode = document.getElementById(PAGE_DEBUG_NODE_ID);
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

    document.dispatchEvent(new CustomEvent(CONTENT_BRIDGE_EVENT_NAME, { detail: this.pendingDetail }));
    this.pendingDetail = null;
  }
}
