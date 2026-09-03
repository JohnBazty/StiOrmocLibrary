import { useCallback, useEffect, useState } from 'react'
import type { BookCatalogItem } from './book-catalog-types'
import { getCurrentClaims } from '../auth/auth-storage'

const STORAGE_PREFIX = 'smartlib.book-cart.v1'
const CHANGE_EVENT = 'smartlib:book-cart-change'

export type BookCartItem = Pick<BookCatalogItem, 'titleId' | 'title' | 'author' | 'isbn' | 'shelfLocation' | 'callNumber' | 'previewBarcode' | 'coverImagePath'>

function storageKey() {
  const claims = getCurrentClaims()
  return `${STORAGE_PREFIX}:${claims?.userId ?? claims?.schoolId ?? 'anonymous'}`
}

function isCartItem(value: unknown): value is BookCartItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BookCartItem>
  return Number.isSafeInteger(item.titleId) && Number(item.titleId) > 0 && typeof item.title === 'string' && typeof item.author === 'string'
}

export function readBookCart(): BookCartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey()) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : []
  } catch {
    return []
  }
}

function writeBookCart(items: BookCartItem[]) {
  window.sessionStorage.setItem(storageKey(), JSON.stringify(items))
  window.dispatchEvent(new CustomEvent<BookCartItem[]>(CHANGE_EVENT, { detail: items }))
}

export function useBookCart() {
  const [items, setItems] = useState<BookCartItem[]>(readBookCart)
  useEffect(() => {
    const sync = (event: Event) => setItems(event instanceof CustomEvent && Array.isArray(event.detail) ? event.detail : readBookCart())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(CHANGE_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  const addItem = useCallback((item: BookCartItem) => {
    const current = readBookCart()
    if (!current.some((entry) => entry.titleId === item.titleId)) writeBookCart([...current, item])
  }, [])
  const removeItem = useCallback((titleId: number) => writeBookCart(readBookCart().filter((item) => item.titleId !== titleId)), [])
  const updateItem = useCallback((titleId: number, updates: Partial<BookCartItem>) => {
    const current = readBookCart()
    const next = current.map((item) => item.titleId === titleId ? { ...item, ...updates } : item)
    const before = current.find((item) => item.titleId === titleId)
    const after = next.find((item) => item.titleId === titleId)
    if (before && after && JSON.stringify(before) !== JSON.stringify(after)) writeBookCart(next)
  }, [])
  const clear = useCallback(() => writeBookCart([]), [])
  return { items, addItem, updateItem, removeItem, clear }
}

export function clearBookCartForTests() {
  if (typeof window === 'undefined') return
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index)
    if (key?.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(key)
  }
}
