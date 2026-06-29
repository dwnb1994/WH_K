'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  label: string
  placeholder?: string
  hint?: string
  onScan: (value: string) => void
  className?: string
}

function normalize(v: string) {
  return v.replace(/[\r\n\t]/g, '').trim()
}

/**
 * รองรับ 2 โหมด
 * 1) ยิง barcode scanner แบบ keyboard wedge → จะพิมพ์รวดเดียวแล้วจบด้วย Enter
 * 2) พิมพ์เอง แล้วกด Enter
 */
export function ScanInput({ label, placeholder, hint, onScan, className }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')
  const [isListening, setIsListening] = useState(true)

  const shouldBindGlobal = useMemo(() => isListening, [isListening])

  useEffect(() => {
    if (!shouldBindGlobal) return

    let buffer = ''
    let lastAt = 0
    const MAX_GAP_MS = 50

    const onKeyDown = (e: KeyboardEvent) => {
      // ถ้า user กำลังโฟกัส input อื่น ให้ไม่แย่ง
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as any).isContentEditable)) {
        return
      }

      const now = Date.now()
      if (now - lastAt > MAX_GAP_MS) buffer = ''
      lastAt = now

      if (e.key === 'Enter') {
        const scanned = normalize(buffer)
        buffer = ''
        if (scanned) onScan(scanned)
        return
      }

      if (e.key.length === 1) {
        buffer += e.key
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onScan, shouldBindGlobal])

  const scanNow = () => {
    const v = normalize(value)
    if (!v) return
    setValue('')
    onScan(v)
  }

  return (
    <div className={cn('rounded-[14px] border border-line bg-white p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted">{label}</p>
          {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
        </div>
        <button
          type="button"
          className={cn(
            'rounded-lg border px-3 py-1.5 text-[12px] font-semibold',
            isListening ? 'border-brand bg-brand text-white' : 'border-line bg-white text-zinc-700',
          )}
          onClick={() => setIsListening(v => !v)}
        >
          {isListening ? 'โหมดสแกน: ON' : 'โหมดสแกน: OFF'}
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              scanNow()
            }
          }}
          placeholder={placeholder ?? 'สแกน/พิมพ์ แล้วกด Enter'}
          className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={scanNow}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-zinc-800"
        >
          เพิ่ม
        </button>
      </div>
    </div>
  )
}
