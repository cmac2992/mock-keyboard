import {
  buildChangeDetail,
  computeKeyboardHeight,
  deriveVisibility,
  describeElement,
  isBottomAnchoredCandidate,
  isEditableElement,
  mergeTransform
} from '../../src/shared/utils';
import type { KeyboardState } from '../../src/shared/types';

describe('shared utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('computes keyboard height by preset', () => {
    expect(computeKeyboardHeight('android-compact', 600)).toBe(240);
    expect(computeKeyboardHeight('android-standard', 900)).toBe(340);
    expect(computeKeyboardHeight('android-tall', 500)).toBe(280);
  });

  it('detects editable elements', () => {
    document.body.innerHTML = `
      <input id="text" />
      <input id="hidden" type="hidden" />
      <textarea id="area"></textarea>
      <div id="editable" contenteditable="true"></div>
    `;

    expect(isEditableElement(document.getElementById('text'))).toBe(true);
    expect(isEditableElement(document.getElementById('hidden'))).toBe(false);
    expect(isEditableElement(document.getElementById('area'))).toBe(true);
    expect(isEditableElement(document.getElementById('editable'))).toBe(true);
  });

  it('derives visibility from mode and focus', () => {
    const input = document.createElement('input');
    expect(deriveVisibility('auto', input)).toBe(true);
    expect(deriveVisibility('auto', null)).toBe(false);
    expect(deriveVisibility('force-open', null)).toBe(true);
    expect(deriveVisibility('force-closed', input)).toBe(false);
  });

  it('describes elements with stable selectors', () => {
    const field = document.createElement('input');
    field.id = 'email';
    expect(describeElement(field)).toBe('#email');

    const named = document.createElement('input');
    named.name = 'password';
    expect(describeElement(named)).toBe('input[name="password"]');

    const classed = document.createElement('div');
    classed.className = 'composer sticky';
    expect(describeElement(classed)).toBe('div.composer.sticky');
  });

  it('marks bottom anchored candidates near the viewport bottom', () => {
    const fixed = document.createElement('div');
    fixed.setAttribute('style', 'position: fixed;');
    document.body.append(fixed);

    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      position: 'fixed'
    } as CSSStyleDeclaration);
    vi.spyOn(fixed, 'getBoundingClientRect').mockReturnValue({
      bottom: 800,
      height: 40,
      width: 300
    } as DOMRect);

    expect(isBottomAnchoredCandidate(fixed, 800, null)).toBe(true);
  });

  it('merges transforms with keyboard offset', () => {
    expect(mergeTransform('', 320)).toBe('translate3d(0, -320px, 0)');
    expect(mergeTransform('scale(1)', 280)).toBe('scale(1) translate3d(0, -280px, 0)');
  });

  it('builds change detail payloads', () => {
    const state: KeyboardState = {
      enabled: true,
      visibilityMode: 'auto',
      preset: 'android-standard',
      preferNativeViewport: false,
      visible: true,
      heightPx: 320,
      debug: false,
      activeSelector: '#field',
      shiftedElementCount: 2,
      unsupportedReason: null
    };

    expect(buildChangeDetail(state, 'auto-focus')).toEqual({
      visible: true,
      heightPx: 320,
      preset: 'android-standard',
      source: 'auto-focus'
    });
  });
});
