'use client'

import { useEmployees } from '@warehouse/api-client/hooks'
import { PageHeader, Card, Btn } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'

const ROLE_LABEL: Record<string, string> = {
  WAREHOUSE_MANAGER: 'ผู้จัดการคลัง',
  WAREHOUSE_STAFF: 'พนักงานคลัง',
  REQUESTER: 'ผู้เบิก',
  SUPERVISOR: 'หัวหน้างาน',
  ADMIN: 'แอดมิน',
}

export default function UsersPage() {
  const { data, isLoading } = useEmployees()

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="ผู้ใช้งาน & สิทธิ์"
        subtitle="จัดการพนักงาน · Role-based access"
        actions={<Btn>+ เพิ่มผู้ใช้</Btn>}
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_140px_100px_80px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>รหัส</span><span>ชื่อ</span><span>บทบาท</span><span>คลัง</span><span className="text-right">สถานะ</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted">กำลังโหลด...</div>
        ) : !data?.length ? (
          <div className="p-8 text-center text-[13px] text-muted">ไม่พบผู้ใช้งาน</div>
        ) : data.map(emp => (
          <div
            key={emp.id}
            className="grid grid-cols-[100px_1fr_140px_100px_80px] items-center gap-2 border-t border-line px-5 py-3.5 text-[13px]"
          >
            <span className="font-mono font-semibold">{emp.code}</span>
            <span className="font-medium">{emp.name}</span>
            <span className="text-zinc-600">{ROLE_LABEL[emp.role] ?? emp.role}</span>
            <span className="font-mono text-[12px] text-muted">{emp.warehouses?.code ?? '—'}</span>
            <span className="text-right">
              {emp.active ? <Badge variant="synced">ใช้งาน</Badge> : <Badge variant="pending">ปิด</Badge>}
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
