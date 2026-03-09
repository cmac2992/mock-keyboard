import { NON_TEXT_INPUT_TYPES } from './constants';
import type { KeyboardPreset, KeyboardViewportMetrics, VisibilityMode } from './types';

// Keyboard height is a viewport-relative estimate, not a fixed device constant.
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

export function computeKeyboardOffsetFormulaPx(win: Window): number {
  const visualViewport = win.visualViewport;
  return Math.max(
    0,
    Math.round(
      win.innerHeight -
        (visualViewport?.height ?? win.innerHeight) -
        (visualViewport?.offsetTop ?? 0)
    )
  );
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

// Extension injection only works on regular web documents.
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
