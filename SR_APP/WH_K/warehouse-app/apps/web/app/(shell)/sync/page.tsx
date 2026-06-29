'use client'

import { useSyncStatus } from '@warehouse/api-client/hooks'
import { PageHeader, Card, Btn, KpiCard } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { fmtDateTime } from '../../../lib/format'

export default function SyncPage() {
  const { data, isLoading, refetch } = useSyncStatus()
  const counts = data?.counts ?? { PENDING: 0, SYNCED: 0, ERROR: 0 }
  const recent = data?.recent ?? []

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="บันทึกการซิงก์ TRCloud"
        subtitle="Offline queue · retry · error log"
        actions={
          <>
            <Btn variant="secondary" onClick={() => refetch()}>รีเฟรช</Btn>
            <Btn>Force flush queue</Btn>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3.5">
        <KpiCard label="รอซิงก์" value={String(counts.PENDING)} hintTone="warn" accent="#d99a2b" />
        <KpiCard label="สำเร็จ" value={String(counts.SYNCED)} hintTone="good" accent="#2f9e6b" />
        <KpiCard label="ผิดพลาด" value={String(counts.ERROR)} hintTone="danger" accent="#d6493b" />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[80px_70px_1fr_100px_120px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>เวลา</span><span>ประเภท</span><span>รายละเอียด</span>
          <span className="text-right">Retry</span><span className="text-right">สถานะ</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted">กำลังโหลด...</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted">ไม่มีรายการในคิวซิงก์</div>
        ) : recent.map(row => (
          <div
            key={row.id}
            className="grid grid-cols-[80px_70px_1fr_100px_120px] items-center gap-2 border-t border-line px-5 py-3 text-[13px]"
          >
            <span className="font-mono text-[12px] text-muted">
              {new Date(row.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <Badge variant={row.type === 'GR' ? 'in' : 'out'}>{row.type}</Badge>
            <span className="truncate font-mono text-[11.5px] text-muted">
              {row.error_message ?? row.id.slice(0, 8)}
            </span>
            <span className="text-right text-muted">{row.retry_count}/3</span>
            <span className="text-right">
              {row.status === 'SYNCED'
                ? <Badge variant="synced">สำเร็จ</Badge>
                : row.status === 'ERROR'
                  ? <Badge variant="error">ผิดพลาด</Badge>
                  : <Badge variant="warn">รอ</Badge>}
            </span>
          </div>
        ))}
      </Card>

      {recent[0]?.synced_at && (
        <p className="mt-3 text-[12px] text-muted">
          ซิงก์ล่าสุด: {fmtDateTime(recent[0].synced_at)}
        </p>
      )}
    </div>
  )
}
