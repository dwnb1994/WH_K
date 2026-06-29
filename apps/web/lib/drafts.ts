export type DraftPhoto = {
  id: string
  name: string
  type: string
  dataUrl: string
  createdAt: string
}

export type ReceiveDraftLine = {
  id: string
  sku: string
  name?: string
  qty: number
  unit?: string
  bin?: string
  remark?: string
}

export type ReceiveDraft = {
  id: string
  kind: 'RECEIVE'
  createdAt: string
  updatedAt: string
  poRef?: string
  supplierName?: string
  warehouseCode?: string
  receivedBy?: string
  lines: ReceiveDraftLine[]
  photos: DraftPhoto[]
}

export type WithdrawDraftLine = {
  id: string
  sku: string
  name?: string
  qty: number
  unit?: string
  remark?: string
}

export type WithdrawDraft = {
  id: string
  kind: 'WITHDRAW'
  createdAt: string
  updatedAt: string
  mrRef?: string
  workOrderNumber?: string
  project?: string
  department?: string
  machine?: string
  activity?: string
  requester?: string
  lines: WithdrawDraftLine[]
  photos: DraftPhoto[]
}

export type AnyDraft = ReceiveDraft | WithdrawDraft

const STORAGE_KEY = 'warehouse:drafts:v1'

function nowIso() {
  return new Date().toISOString()
}

function rid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createEmptyReceiveDraft(): ReceiveDraft {
  const ts = nowIso()
  return {
    id: rid(),
    kind: 'RECEIVE',
    createdAt: ts,
    updatedAt: ts,
    poRef: '',
    supplierName: '',
    warehouseCode: '',
    receivedBy: '',
    lines: [],
    photos: [],
  }
}

export function createEmptyWithdrawDraft(): WithdrawDraft {
  const ts = nowIso()
  return {
    id: rid(),
    kind: 'WITHDRAW',
    createdAt: ts,
    updatedAt: ts,
    mrRef: '',
    workOrderNumber: '',
    project: '',
    department: '',
    machine: '',
    activity: '',
    requester: '',
    lines: [],
    photos: [],
  }
}

function safeParse(raw: string | null): AnyDraft[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? (data as AnyDraft[]) : []
  } catch {
    return []
  }
}

export function loadDrafts(): AnyDraft[] {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export function saveDrafts(drafts: AnyDraft[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
}

export function upsertDraft(draft: AnyDraft): void {
  const drafts = loadDrafts()
  const next = drafts.filter(d => d.id !== draft.id)
  next.unshift({ ...draft, updatedAt: nowIso() } as AnyDraft)
  saveDrafts(next)
}

export function deleteDraft(id: string): void {
  const drafts = loadDrafts().filter(d => d.id !== id)
  saveDrafts(drafts)
}

export function addPhoto(draft: AnyDraft, photo: Omit<DraftPhoto, 'id' | 'createdAt'>): AnyDraft {
  const next: DraftPhoto = { ...photo, id: rid(), createdAt: nowIso() }
  return { ...draft, photos: [next, ...draft.photos], updatedAt: nowIso() } as AnyDraft
}

export function removePhoto(draft: AnyDraft, photoId: string): AnyDraft {
  return { ...draft, photos: draft.photos.filter(p => p.id !== photoId), updatedAt: nowIso() } as AnyDraft
}

