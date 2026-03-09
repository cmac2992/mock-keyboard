import type { CSSProperties } from 'react';
import type { KeyboardOverlayDebugModel, KeyboardOverlayProps } from './KeyboardOverlay';
import type { KeyboardState, KeyboardViewportMetrics } from '../shared/types';
import { computeKeyboardOffsetFormulaPx } from '../shared/utils';

interface OverlayLayoutStyles {
  keyboardStyle: CSSProperties;
  safeAreaStyle: CSSProperties;
}

export function buildOverlayDebugModel(
  state: KeyboardState,
  viewport: KeyboardViewportMetrics,
  win: Window
): KeyboardOverlayDebugModel {
  return {
    visible: state.visible,
    heightPx: state.heightPx,
    preset: state.preset,
    keyboardOffsetPx: computeKeyboardOffsetFormulaPx(win),
    viewportLabel: `${viewport.height.toFixed(0)}h / ${viewport.width.toFixed(0)}w`,
    innerHeightLabel: `${win.innerHeight}px`,
    sourceLabel: state.visibilityMode
  };
}

export function buildOverlayProps(
  state: KeyboardState,
  viewport: KeyboardViewportMetrics,
  badgeModel: KeyboardOverlayDebugModel | null
): KeyboardOverlayProps {
  const keyboardHeight = state.visible ? state.heightPx : 0;

  return {
    visible: state.enabled && state.visible,
    preset: state.preset,
    safeAreaVisible: state.enabled && state.visible && state.debug,
    badgeVisible: state.debug,
    badgeModel,
    ...buildOverlayLayoutStyles(viewport, keyboardHeight)
  };
}

function buildOverlayLayoutStyles(
  viewport: KeyboardViewportMetrics,
  keyboardHeight: number
): OverlayLayoutStyles {
  return {
    keyboardStyle: {
      left: `${viewport.offsetLeft}px`,
      top: `${viewport.offsetTop + viewport.height - keyboardHeight}px`,
      width: `${viewport.width}px`,
      height: `${keyboardHeight}px`
    },
    safeAreaStyle: {
      left: `${viewport.offsetLeft}px`,
      top: `${viewport.offsetTop}px`,
      width: `${viewport.width}px`,
      height: `${Math.max(0, viewport.height - keyboardHeight)}px`
    }
  };
}
