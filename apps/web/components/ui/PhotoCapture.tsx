'use client'

import { useRef, useState } from 'react'
import { cn } from '../../lib/cn'

type PhotoItem = {
  name: string
  type: string
  dataUrl: string
}

export function PhotoCapture({
  label = 'รูปถ่ายประกอบ',
  hint = 'ถ่าย/แนบรูป แล้วเก็บไว้ในเครื่องก่อน (offline)',
  onAdd,
  className,
}: {
  label?: string
  hint?: string
  onAdd: (photo: PhotoItem) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  const readFile = async (file: File) => {
    setBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result ?? ''))
        r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
        r.readAsDataURL(file)
      })
      onAdd({ name: file.name, type: file.type, dataUrl })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('rounded-[14px] border border-line bg-white p-4', className)}>
      <p className="text-[12px] font-bold uppercase tracking-wide text-muted">{label}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void readFile(file)
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            'rounded-lg px-4 py-2 text-[13px] font-semibold',
            busy ? 'bg-surface text-muted' : 'bg-brand text-white hover:bg-zinc-800',
          )}
        >
          {busy ? 'กำลังอ่านรูป…' : 'ถ่าย/แนบรูป'}
        </button>
        <span className="text-[12px] text-muted">เก็บเป็น DataURL ใน localStorage</span>
      </div>
    </div>
  )
}

