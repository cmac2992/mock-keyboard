import type { ReactNode } from 'react';
import type { KeyboardDebugSnapshot } from '../shared/types';

export function DebugSnapshotView(props: {
  snapshot: KeyboardDebugSnapshot | null;
  keyboardEnabled: boolean;
}) {
  if (!props.keyboardEnabled) {
    return <DebugEmptyState>Simulator disabled for this tab.</DebugEmptyState>;
  }

  if (!props.snapshot) {
    return <DebugEmptyState>Open this section to inspect viewport shim state.</DebugEmptyState>;
  }

  const { snapshot } = props;

  return (
    <>
      <DebugSection title="Controller">
        <DebugField label="visible" value={String(snapshot.visible)} />
        <DebugField label="heightPx" value={String(snapshot.heightPx)} />
        <DebugField label="preset" value={snapshot.preset} />
        <DebugField label="visibilityMode" value={snapshot.visibilityMode} />
        <DebugField label="activeSelector" value={snapshot.activeSelector ?? 'None'} />
        <DebugField label="keyboardOffsetFormulaPx" value={String(snapshot.keyboardOffsetFormulaPx)} />
        <DebugField label="contentViewport" value={formatViewport(snapshot.contentViewport)} />
        <DebugField
          label="contentInner"
          value={`${snapshot.contentInnerWidth} x ${snapshot.contentInnerHeight}`}
        />
      </DebugSection>

      {snapshot.lastChange ? (
        <DebugSection title="Last Change">
          <DebugField label="source" value={snapshot.lastChange.source} />
          <DebugField label="visible" value={String(snapshot.lastChange.visible)} />
          <DebugField label="heightPx" value={String(snapshot.lastChange.heightPx)} />
        </DebugSection>
      ) : null}

      <DebugSection title="Page Shim">
        {snapshot.page ? (
          <>
            <DebugField label="eventCount" value={String(snapshot.page.eventCount)} />
            <DebugField
              label="keyboardOffsetFormulaPx"
              value={String(snapshot.page.keyboardOffsetFormulaPx)}
            />
            <DebugField label="windowPatched" value={String(snapshot.page.shim.windowPatched)} />
            <DebugField
              label="visualViewportPatched"
              value={String(snapshot.page.shim.visualViewportPatched)}
            />
            <DebugField
              label="observed.inner"
              value={`${snapshot.page.observed.innerWidth} x ${snapshot.page.observed.innerHeight}`}
            />
            <DebugField
              label="observed.visualViewport"
              value={formatObservedViewport(snapshot)}
            />
          </>
        ) : (
          <DebugEmptyState>Waiting for a page-context snapshot.</DebugEmptyState>
        )}
      </DebugSection>
    </>
  );
}

export function formatBridgeSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  if (snapshot.bridgeReady) {
    return snapshot.pendingBridgeEvent ? 'Ready / pending event' : 'Ready';
  }

  return snapshot.bridgeInjected ? 'Injected / waiting' : 'Not injected';
}

export function formatEventSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot?.lastChange) {
    return 'None';
  }

  return `${snapshot.lastChange.source} (${snapshot.lastChange.heightPx}px)`;
}

export function formatViewportSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  return formatViewport(snapshot.contentViewport);
}

export function formatShimSummary(snapshot: KeyboardDebugSnapshot | null): string {
  if (!snapshot) {
    return 'Unavailable';
  }

  if (!snapshot.page) {
    return 'No page shim data';
  }

  return `${snapshot.page.shim.windowPatched ? 'window' : 'window off'} / ${
    snapshot.page.shim.visualViewportPatched ? 'visualViewport' : 'visualViewport off'
  } / ${snapshot.page.eventCount} events`;
}

function formatViewport(viewport: KeyboardDebugSnapshot['contentViewport']): string {
  return `${Math.round(viewport.width)} x ${Math.round(viewport.height)} @ ${Math.round(
    viewport.offsetTop
  )},${Math.round(viewport.offsetLeft)}`;
}

function formatObservedViewport(snapshot: KeyboardDebugSnapshot): string {
  if (!snapshot.page) {
    return 'Unavailable';
  }

  return `${snapshot.page.observed.visualViewportWidth ?? 'null'} x ${
    snapshot.page.observed.visualViewportHeight ?? 'null'
  } @ ${snapshot.page.observed.visualViewportOffsetTop ?? 'null'},${
    snapshot.page.observed.visualViewportOffsetLeft ?? 'null'
  }`;
}

function DebugSection(props: { children: ReactNode; title: string }) {
  return (
    <section className="debug-section">
      <h3 className="debug-section-title">{props.title}</h3>
      <dl className="debug-grid">{props.children}</dl>
    </section>
  );
}

function DebugField(props: { label: string; value: string }) {
  return (
    <>
      <dt className="debug-term">{props.label}</dt>
      <dd className="debug-value">{props.value}</dd>
    </>
  );
}

function DebugEmptyState(props: { children: ReactNode }) {
  return <p className="debug-empty">{props.children}</p>;
}
