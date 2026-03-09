import type { KeyboardState, KeyboardPreset } from './types';

export const PANEL_PORT_PREFIX = 'mock-keyboard-panel:';
export const TAB_STATE_STORAGE_PREFIX = 'mock-keyboard-tab:';
export const DEFAULTS_STORAGE_KEY = 'mock-keyboard-defaults';
export const ROOT_DATA_ATTRIBUTE = 'data-mock-keyboard';
export const OVERLAY_HOST_ID = '__mock-keyboard-host';
export const ANIMATION_MS = 220;

export const KEYBOARD_PRESET_LABELS: Record<KeyboardPreset, string> = {
  'android-compact': 'Android Compact',
  'android-standard': 'Android Standard',
  'android-tall': 'Android Tall'
};

export const DEFAULT_KEYBOARD_STATE: KeyboardState = {
  enabled: false,
  visibilityMode: 'auto',
  preset: 'android-standard',
  visible: false,
  heightPx: 0,
  debug: false,
  activeSelector: null,
  unsupportedReason: null
};

export const NON_TEXT_INPUT_TYPES = new Set([
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
