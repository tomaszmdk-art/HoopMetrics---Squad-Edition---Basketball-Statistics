import { useLayoutEffect, useRef } from 'react';

export type AppTab = 'home' | 'live' | 'roster' | 'history' | 'parent';

export interface PageNavState {
  bsKind: 'lobby' | 'lobby-parent' | 'room';
  bsRoomId?: string | null;
  bsViewMode?: 'coach' | 'spectator';
  bsTab?: AppTab;
}

export interface AppHistoryState extends PageNavState {
  bsApp: true;
  bsSeq: number;
  bsModalId?: string | null;
}

interface ModalEntry {
  id: string;
  seq: number;
  onClose: () => void;
}

type PagePopListener = (state: AppHistoryState | null) => void;

let initialized = false;
let listenerAttached = false;
let seqCounter = 1;
let modalIdCounter = 0;

let currentBasePage: AppHistoryState = {
  bsApp: true,
  bsSeq: 1,
  bsKind: 'lobby',
  bsRoomId: null,
  bsModalId: null,
};

const modalStack: ModalEntry[] = [];
const poppedByBrowserIds = new Set<string>();
const consumedByNavIds = new Set<string>();

let pendingManualPopCount = 0;
let manualPopFlushScheduled = false;
let ignorePopCount = 0;
let pendingReplaceAfterPop: { state: AppHistoryState; url: string } | null = null;
let pagePopListener: PagePopListener | null = null;

function isSamePage(a?: PageNavState | null, b?: PageNavState | null): boolean {
  if (!a || !b) return false;
  return (
    a.bsKind === b.bsKind &&
    (a.bsRoomId || null) === (b.bsRoomId || null) &&
    (a.bsViewMode || 'coach') === (b.bsViewMode || 'coach') &&
    (a.bsTab || 'home') === (b.bsTab || 'home')
  );
}

function handleWindowPopState(event: PopStateEvent): void {
  if (ignorePopCount > 0) {
    ignorePopCount--;
    if (ignorePopCount === 0 && pendingReplaceAfterPop) {
      const { state, url } = pendingReplaceAfterPop;
      pendingReplaceAfterPop = null;
      window.history.replaceState(state, '', url);
    }
    return;
  }

  const incoming = (event.state as AppHistoryState | null) || null;
  const targetSeq = incoming?.bsApp && typeof incoming.bsSeq === 'number' ? incoming.bsSeq : 0;

  let poppedAnyModal = false;
  while (modalStack.length > 0 && modalStack[modalStack.length - 1].seq > targetSeq) {
    const popped = modalStack.pop()!;
    poppedByBrowserIds.add(popped.id);
    poppedAnyModal = true;
    try {
      popped.onClose();
    } catch {
      // ignore modal close errors
    }
  }

  if (poppedAnyModal && incoming?.bsApp && isSamePage(incoming, currentBasePage)) {
    return;
  }

  if (incoming?.bsApp) {
    currentBasePage = {
      bsApp: true,
      bsSeq: incoming.bsSeq,
      bsKind: incoming.bsKind,
      bsRoomId: incoming.bsRoomId || null,
      bsViewMode: incoming.bsViewMode,
      bsTab: incoming.bsTab || 'home',
      bsModalId: null,
    };
    seqCounter = Math.max(seqCounter, incoming.bsSeq || 1);
  }

  if (pagePopListener) {
    pagePopListener(incoming);
  }
}

function ensurePopListener(): void {
  if (typeof window === 'undefined' || listenerAttached) return;
  window.addEventListener('popstate', handleWindowPopState);
  listenerAttached = true;
}

function flushManualPops(): void {
  manualPopFlushScheduled = false;
  const pops = pendingManualPopCount;
  pendingManualPopCount = 0;
  if (pops > 0 && typeof window !== 'undefined') {
    ignorePopCount += 1;
    window.history.go(-pops);
  }
}

export function buildRoomUrl(
  roomId: string | null,
  viewMode: 'coach' | 'spectator' = 'coach',
  tab: AppTab = 'home'
): string {
  if (!roomId) return '/';
  const params = new URLSearchParams();
  params.set('room', roomId);
  if (viewMode === 'spectator') {
    params.set('view', 'spectator');
  }
  if (tab && tab !== 'home') {
    params.set('tab', tab);
  }
  return `/?${params.toString()}`;
}

export function initNavigationHistory(initialNav: PageNavState): void {
  if (typeof window === 'undefined') return;
  ensurePopListener();
  if (initialized) return;
  initialized = true;

  const existing = window.history.state as AppHistoryState | null;
  if (existing?.bsApp && typeof existing.bsSeq === 'number') {
    seqCounter = Math.max(seqCounter, existing.bsSeq);
    currentBasePage = {
      ...existing,
      bsModalId: null,
    };
    if (existing.bsModalId) {
      window.history.replaceState(currentBasePage, '', window.location.href);
    }
    return;
  }

  const baseState: AppHistoryState = {
    bsApp: true,
    bsSeq: seqCounter,
    bsKind: initialNav.bsKind,
    bsRoomId: initialNav.bsRoomId || null,
    bsViewMode: initialNav.bsViewMode,
    bsTab: initialNav.bsTab || 'home',
    bsModalId: null,
  };
  currentBasePage = baseState;
  window.history.replaceState(baseState, '', window.location.href);
}

export function subscribeToPagePopState(listener: PagePopListener): () => void {
  ensurePopListener();
  pagePopListener = listener;
  return () => {
    if (pagePopListener === listener) {
      pagePopListener = null;
    }
  };
}

export function pushPageHistory(nav: PageNavState, url: string): void {
  if (typeof window === 'undefined') return;
  ensurePopListener();

  const openCount = modalStack.length;
  while (modalStack.length > 0) {
    const m = modalStack.pop()!;
    consumedByNavIds.add(m.id);
  }
  const totalSlotsToClear = openCount + pendingManualPopCount;
  pendingManualPopCount = 0;

  const nextState: AppHistoryState = {
    bsApp: true,
    bsSeq: ++seqCounter,
    bsKind: nav.bsKind,
    bsRoomId: nav.bsRoomId || null,
    bsViewMode: nav.bsViewMode,
    bsTab: nav.bsTab || 'home',
    bsModalId: null,
  };
  currentBasePage = nextState;

  if (totalSlotsToClear === 0) {
    window.history.pushState(nextState, '', url);
  } else if (totalSlotsToClear === 1) {
    window.history.replaceState(nextState, '', url);
  } else {
    ignorePopCount += 1;
    pendingReplaceAfterPop = { state: nextState, url };
    window.history.go(-(totalSlotsToClear - 1));
  }
}

export function replacePageHistory(nav: PageNavState, url: string): void {
  if (typeof window === 'undefined') return;
  ensurePopListener();

  const openCount = modalStack.length;
  while (modalStack.length > 0) {
    const m = modalStack.pop()!;
    consumedByNavIds.add(m.id);
  }
  const totalSlotsToClear = openCount + pendingManualPopCount;
  pendingManualPopCount = 0;

  const nextState: AppHistoryState = {
    bsApp: true,
    bsSeq: ++seqCounter,
    bsKind: nav.bsKind,
    bsRoomId: nav.bsRoomId || null,
    bsViewMode: nav.bsViewMode,
    bsTab: nav.bsTab || 'home',
    bsModalId: null,
  };
  currentBasePage = nextState;

  if (totalSlotsToClear === 0) {
    window.history.replaceState(nextState, '', url);
  } else {
    ignorePopCount += 1;
    pendingReplaceAfterPop = { state: nextState, url };
    window.history.go(-totalSlotsToClear);
  }
}

function registerBackModal(onClose: () => void, keyPrefix = 'modal'): string {
  if (typeof window === 'undefined') return '';
  ensurePopListener();

  const id = `${keyPrefix}-${++modalIdCounter}`;
  const nextSeq = ++seqCounter;
  const nextState: AppHistoryState = {
    ...currentBasePage,
    bsApp: true,
    bsSeq: nextSeq,
    bsModalId: id,
  };

  if (pendingManualPopCount > 0) {
    pendingManualPopCount--;
    window.history.replaceState(nextState, '', window.location.href);
  } else {
    window.history.pushState(nextState, '', window.location.href);
  }

  modalStack.push({ id, seq: nextSeq, onClose });
  return id;
}

function unregisterBackModal(id: string): void {
  if (!id || typeof window === 'undefined') return;

  if (poppedByBrowserIds.has(id)) {
    poppedByBrowserIds.delete(id);
    return;
  }
  if (consumedByNavIds.has(id)) {
    consumedByNavIds.delete(id);
    return;
  }

  const idx = modalStack.findIndex((m) => m.id === id);
  if (idx === -1) return;

  modalStack.splice(idx, 1);
  pendingManualPopCount++;
  if (!manualPopFlushScheduled) {
    manualPopFlushScheduled = true;
    queueMicrotask(flushManualPops);
  }
}

/**
 * Registers an open modal/overlay in browser history so mobile Back button closes it
 * instead of leaving the current screen or app.
 */
export function useBackHandler(
  isOpen: boolean,
  onClose: () => void,
  modalKey = 'modal'
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const id = registerBackModal(() => {
      onCloseRef.current();
    }, modalKey);

    return () => {
      unregisterBackModal(id);
    };
  }, [isOpen, modalKey]);
}
