import { useMemo, useState, type ReactNode } from 'react';
import { KEYBOARD_PRESET_LABELS } from '../shared/constants';
import type { KeyboardPreset, VisibilityMode } from '../shared/types';
import {
  DebugSnapshotView,
  formatBridgeSummary,
  formatEventSummary,
  formatShimSummary,
  formatViewportSummary
} from './DebugSnapshotView';
import { usePanelRuntime } from './usePanelRuntime';

const VISIBILITY_OPTIONS: VisibilityMode[] = ['auto', 'force-open', 'force-closed'];

export function PanelApp() {
  const tabId = useMemo(() => resolveTabIdSafely(), []);
  const [advancedDebugOpen, setAdvancedDebugOpen] = useState(false);
  const {
    tabState,
    debugSnapshot,
    panelInvalidated,
    sendEnabled,
    sendDebug,
    sendVisibilityMode,
    sendPreset,
    refreshDebugSnapshot
  } = usePanelRuntime(tabId, advancedDebugOpen);

  const keyboard = tabState.keyboard;
  const controlsDisabled = keyboard.unsupportedReason !== null || tabId === 0;
  const statusText = `${keyboard.enabled ? 'Enabled' : 'Disabled'} / ${
    keyboard.visible ? 'Visible' : 'Hidden'
  }`;
  const noticeText = tabId === 0
    ? 'Extension reloaded. Close and reopen the Mock Keyboard panel.'
    : panelInvalidated
    ? 'Extension reloaded. Close and reopen the Mock Keyboard panel.'
    : keyboard.unsupportedReason;

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Mock Keyboard controls">
        <div className="toolbar-group">
          <span className="toolbar-title">Mock Keyboard</span>
        </div>
        <div className="toolbar-group toolbar-group--end">
          <label className="checkbox-item checkbox-item--toolbar">
            <input
              id="enabled"
              checked={keyboard.enabled}
              disabled={controlsDisabled || panelInvalidated}
              onChange={(event) => {
                void sendEnabled(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <span>Enabled</span>
          </label>
        </div>
      </div>

      <main className="panel" aria-label="Mock Keyboard panel">
        <section aria-labelledby="controls-heading">
          <h2 id="controls-heading" className="section-header">
            Controls
          </h2>

          <div className="row">
            <label className="row-label" htmlFor="visibilityMode">
              Visibility
            </label>
            <select
              id="visibilityMode"
              disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
              onChange={(event) => {
                void sendVisibilityMode(event.currentTarget.value as VisibilityMode);
              }}
              value={keyboard.visibilityMode}
            >
              {VISIBILITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <label className="row-label" htmlFor="preset">
              Preset
            </label>
            <select
              id="preset"
              disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
              onChange={(event) => {
                void sendPreset(event.currentTarget.value as KeyboardPreset);
              }}
              value={keyboard.preset}
            >
              {Object.entries(KEYBOARD_PRESET_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <span className="row-label">Debug</span>
            <label className="checkbox-item">
              <input
                id="debug"
                checked={keyboard.debug}
                disabled={controlsDisabled || !keyboard.enabled || panelInvalidated}
                onChange={(event) => {
                  void sendDebug(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              <span>Debug overlays</span>
            </label>
          </div>
        </section>

        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="section-header">
            Status
          </h2>

          <InfoRow label="State">
            <strong id="status" className="row-value">
              {statusText}
            </strong>
          </InfoRow>

          <InfoRow label="Target">
            <strong id="activeSelector" className="row-value row-value--code">
              {keyboard.activeSelector ?? 'None'}
            </strong>
          </InfoRow>

          <InfoRow label="Height">
            <strong id="heightPx" className="row-value">
              {keyboard.heightPx}px
            </strong>
          </InfoRow>
        </section>

        <section aria-labelledby="advanced-debug-heading">
          <details
            className="details-section"
            id="advancedDebug"
            onToggle={(event) => {
              setAdvancedDebugOpen((event.currentTarget as HTMLDetailsElement).open);
            }}
            open={advancedDebugOpen}
          >
            <summary className="details-summary" id="advanced-debug-heading">
              Advanced Debugging
            </summary>

            <InfoRow label="Bridge">
              <strong id="debugBridge" className="row-value">
                {formatBridgeSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Last Event">
              <strong id="debugEvent" className="row-value row-value--code">
                {formatEventSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Viewport">
              <strong id="debugViewport" className="row-value row-value--code">
                {formatViewportSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <InfoRow label="Shim">
              <strong id="debugShim" className="row-value row-value--code">
                {formatShimSummary(debugSnapshot)}
              </strong>
            </InfoRow>

            <div className="debug-actions">
              <button
                disabled={panelInvalidated || !keyboard.enabled}
                id="debugRefresh"
                onClick={() => {
                  void refreshDebugSnapshot();
                }}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div id="debugSnapshot" className="debug-snapshot">
              <DebugSnapshotView keyboardEnabled={keyboard.enabled} snapshot={debugSnapshot} />
            </div>
          </details>
        </section>
      </main>

      {noticeText ? (
        <p className="notice" id="notice">
          {noticeText}
        </p>
      ) : (
        <p className="notice" hidden id="notice" />
      )}
    </>
  );
}

function InfoRow(props: { children: ReactNode; label: string }) {
  return (
    <div className="row">
      <span className="row-label">{props.label}</span>
      {props.children}
    </div>
  );
}

function resolveTabIdSafely(): number {
  try {
    const queryTabId = Number(new URLSearchParams(window.location.search).get('tabId'));
    if (Number.isInteger(queryTabId) && queryTabId > 0) {
      return queryTabId;
    }

    if (chrome.devtools?.inspectedWindow?.tabId) {
      return chrome.devtools.inspectedWindow.tabId;
    }
  } catch {
    return 0;
  }

  return 0;
}
