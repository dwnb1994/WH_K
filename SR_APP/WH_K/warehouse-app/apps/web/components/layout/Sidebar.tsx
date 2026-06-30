'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { SyncBadge } from './SyncBadge'
import { useWarehouse } from '../../lib/warehouse-context'
import { WAREHOUSES } from '../../lib/trcloud-warehouse'

const NAV: Array<{ href: string; label: string; icon: string; badge?: boolean }> = [
  { href: '/dashboard', label: 'ภาพรวม', icon: 'grid' },
  { href: '/receive', label: 'รับเข้า', icon: 'in' },
  { href: '/dispatch', label: 'เบิกวัตถุดิบ', icon: 'out' },
  { href: '/stock', label: 'สต็อก', icon: 'box' },
  { href: '/reports', label: 'ต้นทุน & รายงาน', icon: 'chart' },
  { href: '/master/products', label: 'วัตถุดิบ', icon: 'list' },
  { href: '/users', label: 'ผู้ใช้งาน', icon: 'user' },
  { href: '/sync', label: 'การซิงก์', icon: 'sync', badge: true },
]

function NavIcon({ name }: { name: string }) {
  const s = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }
  switch (name) {
    case 'in':
      return <svg {...s}><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
    case 'out':
      return <svg {...s}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    case 'box':
      return <svg {...s}><path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5v-9zM3 7.5l9 4.5 9-4.5" /></svg>
    case 'map':
      return <svg {...s}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    case 'chart':
      return <svg {...s}><path d="M4 19V5M10 19v-9M16 19V9M22 19H2" /></svg>
    case 'list':
      return <svg {...s}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
    case 'user':
      return <svg {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
    case 'sync':
      return <svg {...s}><path d="M21 12a9 9 0 1 1-3-6.7M21 3v5h-5" /></svg>
    default:
      return <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const { warehouse, setWarehouse } = useWarehouse()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // เคลียร์ pending เมื่อ path เปลี่ยนเสร็จ (หน้าใหม่ render แล้ว)
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  // ไม่ preventDefault — ปล่อยให้ <Link> navigate ปกติเพื่อให้ loading.tsx เด้ง skeleton ทันที
  // setPendingHref แค่ทำให้ปุ่ม active ทันทีที่กด (ไม่รอ pathname เปลี่ยน)
  const handleNav = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    setPendingHref(href)
  }

  return (
    <aside className="flex w-[226px] shrink-0 flex-col border-r border-line bg-white px-3.5 py-[18px]">
      <div className="mb-4 flex items-center gap-2.5 px-1.5">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
            <path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5v-9zM3 7.5l9 4.5 9-4.5" />
          </svg>
        </div>
        <div className="text-[14.5px] font-bold tracking-tight">คลังสำรับลาว</div>
      </div>

      <label className="mb-4 block rounded-[10px] border border-line bg-surface px-3 py-2">
        <span className="text-[10px] text-muted">คลังปัจจุบัน</span>
        <select
          value={warehouse}
          onChange={event => setWarehouse(event.target.value as typeof warehouse)}
          className="mt-0.5 w-full cursor-pointer border-0 bg-transparent font-mono text-[13px] font-bold text-ink outline-none focus:ring-0"
        >
          {WAREHOUSES.map(option => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/') || pendingHref === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={event => handleNav(event, item.href)}
              className={cn(
                'flex items-center justify-between rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                active ? 'bg-brand font-semibold text-white' : 'text-zinc-600 hover:bg-surface',
                pendingHref === item.href && pathname !== item.href ? 'opacity-80' : '',
              )}
            >
              <span className="flex items-center gap-2.5">
                <NavIcon name={item.icon} />
                {item.label}
              </span>
              {item.badge && <SyncBadge />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
