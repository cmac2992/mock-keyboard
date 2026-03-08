import { ANCHOR_ATTRIBUTE, IGNORE_ATTRIBUTE, NON_TEXT_INPUT_TYPES } from './constants';
import type {
  KeyboardPreset,
  KeyboardState,
  KeyboardViewportMetrics,
  MockKeyboardChangeDetail,
  OriginalStyleSnapshot,
  VisibilityMode
} from './types';

export function computeKeyboardHeight(
  preset: KeyboardPreset,
  viewportHeight: number
): number {
  const configs: Record<KeyboardPreset, [number, number, number]> = {
    'android-compact': [240, 0.34, 300],
    'android-standard': [260, 0.38, 340],
    'android-tall': [280, 0.42, 380]
  };
  const [min, ratio, max] = configs[preset];
  return clamp(Math.round(viewportHeight * ratio), min, max);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getViewportMetrics(win: Window): KeyboardViewportMetrics {
  const viewport = win.visualViewport;
  if (!viewport) {
    return {
      width: win.innerWidth,
      height: win.innerHeight,
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

export function isEditableElement(node: Element | null): node is HTMLElement {
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
    const type = node.type.toLowerCase();
    return !node.readOnly && !node.disabled && !NON_TEXT_INPUT_TYPES.has(type);
  }

  return false;
}

export function describeElement(element: Element | null): string | null {
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

export function deriveVisibility(
  visibilityMode: VisibilityMode,
  activeEditable: HTMLElement | null
): boolean {
  if (visibilityMode === 'force-open') {
    return true;
  }

  if (visibilityMode === 'force-closed') {
    return false;
  }

  return Boolean(activeEditable);
}

export function mergeTransform(existingTransform: string, keyboardHeight: number): string {
  const shift = `translate3d(0, -${keyboardHeight}px, 0)`;
  const trimmed = existingTransform.trim();
  return trimmed.length > 0 && trimmed !== 'none' ? `${trimmed} ${shift}` : shift;
}

export function buildChangeDetail(
  state: KeyboardState,
  source: MockKeyboardChangeDetail['source']
): MockKeyboardChangeDetail {
  return {
    visible: state.visible,
    heightPx: state.heightPx,
    preset: state.preset,
    source
  };
}

export function makeStyleSnapshot(element: HTMLElement): OriginalStyleSnapshot {
  return {
    transform: element.style.transform,
    transition: element.style.transition,
    bottom: element.style.bottom
  };
}

export function isScrollable(element: HTMLElement): boolean {
  const styles = window.getComputedStyle(element);
  const overflowY = styles.overflowY;
  return /(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight;
}

export function findScrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    if (isScrollable(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function isBottomAnchoredCandidate(
  element: HTMLElement,
  viewportHeight: number,
  overlayHost: HTMLElement | null
): boolean {
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
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  return Math.abs(viewportHeight - rect.bottom) <= 24;
}

export function supportsRuntimeInjection(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return /^https?:/i.test(url);
}

export function setCssVar(
  style: CSSStyleDeclaration,
  name: string,
  value: string | null
): void {
  if (value === null) {
    style.removeProperty(name);
    return;
  }

  style.setProperty(name, value);
}
