'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { WarehouseCode } from './trcloud-warehouse'

const STORAGE_KEY = 'kitchen.warehouse'

type WarehouseContextValue = {
  warehouse: WarehouseCode
  setWarehouse: (next: WarehouseCode) => void
}

const WarehouseContext = createContext<WarehouseContextValue | null>(null)

export function WarehouseProvider({ children }: { children: ReactNode }) {
  // เริ่มที่ 'ALL' เสมอเพื่อให้ server/client render ตรงกัน (กัน hydration mismatch)
  const [warehouse, setWarehouseState] = useState<WarehouseCode>('ALL')

  // โหลดค่าที่เลือกไว้จาก localStorage หลัง mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as WarehouseCode | null
      if (saved) setWarehouseState(saved)
    } catch {
      /* ignore */
    }
  }, [])

  const setWarehouse = (next: WarehouseCode) => {
    setWarehouseState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  return (
    <WarehouseContext.Provider value={{ warehouse, setWarehouse }}>
      {children}
    </WarehouseContext.Provider>
  )
}

export function useWarehouse() {
  const ctx = useContext(WarehouseContext)
  if (!ctx) throw new Error('useWarehouse must be used within WarehouseProvider')
  return ctx
}
