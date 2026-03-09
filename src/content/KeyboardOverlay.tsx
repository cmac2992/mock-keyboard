import type { CSSProperties } from 'react';
import type { KeyboardPreset } from '../shared/types';

export interface KeyboardOverlayProps {
  visible: boolean;
  preset: KeyboardPreset;
  safeAreaVisible: boolean;
  badgeVisible: boolean;
  badgeModel: KeyboardOverlayDebugModel | null;
  keyboardStyle: CSSProperties;
  safeAreaStyle: CSSProperties;
}

export interface KeyboardOverlayDebugModel {
  visible: boolean;
  heightPx: number;
  preset: KeyboardPreset;
  keyboardOffsetPx: number;
  viewportLabel: string;
  innerHeightLabel: string;
  sourceLabel: string;
}

interface KeySpec {
  kind: 'letter' | 'fn' | 'space';
  label: string;
}

const MATERIAL_ICONS = {
  shift: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 1.5 13.5H8v8h8v-8h6.5z" />
    </svg>
  ),
  backspace: (
    <svg width="22" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z" />
    </svg>
  ),
  enter: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7h-2z" />
    </svg>
  ),
  globe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
    </svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
    </svg>
  ),
  expand: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z" />
    </svg>
  )
};

const SUGGESTIONS = ['would', 'could', 'should'];
const WATERMARK = 'v0.2.0';
const letterKey = (label: string): KeySpec => ({ kind: 'letter', label });
const fnKey = (label: string): KeySpec => ({ kind: 'fn', label });
const spaceKey = (label: string): KeySpec => ({ kind: 'space', label });

const LETTER_ROWS: KeySpec[][] = [
  'qwertyuiop'.split('').map(letterKey),
  'asdfghjkl'.split('').map(letterKey),
  [fnKey('shift'), ...'zxcvbnm'.split('').map(letterKey), fnKey('backspace')],
  [
    fnKey('?123'),
    letterKey(','),
    fnKey('globe'),
    spaceKey('English'),
    letterKey('.'),
    fnKey('enter')
  ]
];

export function KeyboardOverlay({
  visible,
  preset,
  safeAreaVisible,
  badgeVisible,
  badgeModel,
  keyboardStyle,
  safeAreaStyle
}: KeyboardOverlayProps) {
  return (
    <div className="mk-root">
      <div className="mk-safe-area" data-visible={String(safeAreaVisible)} style={safeAreaStyle} />
      <div className="mk-badge" data-visible={String(badgeVisible)}>
        <DebugBadge model={badgeModel} />
      </div>
      <div
        className="mk-keyboard"
        data-preset={preset}
        data-visible={String(visible)}
        style={keyboardStyle}
      >
        <div className="mk-suggestion-strip">
          <div className="mk-strip-icon">{MATERIAL_ICONS.mic}</div>
          <div className="mk-strip-divider" />
          {SUGGESTIONS.map((suggestion) => (
            <Suggestion key={suggestion} label={suggestion} />
          ))}
          <div className="mk-strip-icon">{MATERIAL_ICONS.expand}</div>
        </div>
        <div className="mk-rows">
          <KeyRow rowClassName="" keys={LETTER_ROWS[0]} />
          <KeyRow rowClassName="mk-row--offset" keys={LETTER_ROWS[1]} />
          <KeyRow rowClassName="mk-row--shift" keys={LETTER_ROWS[2]} />
          <KeyRow rowClassName="mk-row--bottom" keys={LETTER_ROWS[3]} />
        </div>
        <div className="mk-nav">
          <div className="mk-nav-pill" />
        </div>
        <div className="mk-watermark">{WATERMARK}</div>
      </div>
    </div>
  );
}

function DebugBadge({ model }: { model: KeyboardOverlayDebugModel | null }) {
  if (!model) {
    return null;
  }

  return (
    <>
      <DebugBadgeLine label="visible" value={String(model.visible)} />
      <DebugBadgeLine label="height" value={`${model.heightPx}px`} />
      <DebugBadgeLine label="preset" value={model.preset} />
      <DebugBadgeLine label="offset" value={`${model.keyboardOffsetPx}px`} />
      <DebugBadgeLine label="vv" value={model.viewportLabel} />
      <DebugBadgeLine label="ih" value={model.innerHeightLabel} />
      <DebugBadgeLine label="src" value={model.sourceLabel} />
    </>
  );
}

function DebugBadgeLine(props: { label: string; value: string }) {
  return (
    <div className="mk-badge-line">
      <span className="mk-badge-label">{props.label}</span>
      <span className="mk-badge-separator">:</span>
      <span className="mk-badge-value">{props.value}</span>
    </div>
  );
}

function Suggestion({ label }: { label: string }) {
  return (
    <>
      <div className="mk-suggestion">{label}</div>
      <div className="mk-strip-divider" />
    </>
  );
}

function KeyRow({ keys, rowClassName }: { keys: KeySpec[]; rowClassName: string }) {
  const className = rowClassName ? `mk-row ${rowClassName}` : 'mk-row';
  return (
    <div className={className}>
      {keys.map((key) => (
        <Key key={`${key.kind}-${key.label}`} spec={key} />
      ))}
    </div>
  );
}

function Key({ spec }: { spec: KeySpec }) {
  const classes = ['mk-key'];
  if (spec.kind === 'letter') {
    classes.push('mk-key--letter');
  }
  if (spec.kind === 'fn') {
    classes.push('mk-key--fn');
  }
  if (spec.kind === 'space') {
    classes.push('mk-key--space');
  }

  return <span className={classes.join(' ')}>{renderKeyLabel(spec)}</span>;
}

function renderKeyLabel(spec: KeySpec) {
  switch (spec.label) {
    case 'shift':
      return MATERIAL_ICONS.shift;
    case 'backspace':
      return MATERIAL_ICONS.backspace;
    case 'enter':
      return MATERIAL_ICONS.enter;
    case 'globe':
      return MATERIAL_ICONS.globe;
    default:
      return spec.label;
  }
}
