'use client'

import {
  useDashboardKPI, useMachineABC, useFraudAlerts, useProjectCost,
} from '@warehouse/api-client/hooks'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader, KpiCard, Card, Btn } from '../../../components/ui/PageHeader'
import { fmtMoney } from '../../../lib/format'

const REPORT_TYPES = [
  { id: 'movement', name: 'รายงานเคลื่อนไหวสต็อก', desc: 'รับเข้า / จ่ายออก / ปรับยอด รายวัน' },
  { id: 'valuation', name: 'มูลค่าสต็อกคงคลัง', desc: 'แยกตามคลังและหมวดสินค้า' },
  { id: 'abc', name: 'ต้นทุนตามเครื่องจักร (ABC)', desc: 'Activity-Based Costing จาก WO' },
  { id: 'variance', name: 'ส่วนต่างตรวจนับ', desc: 'Cycle count vs ระบบ' },
  { id: 'sync', name: 'บันทึกการซิงก์ TRCloud', desc: 'สำเร็จ / ล้มเหลว / retry' },
  { id: 'fraud', name: 'รายการผิดปกติ', desc: 'Handshake / Soft block / ปรับยอด' },
]

export default function ReportsPage() {
  const { data: kpi } = useDashboardKPI()
  const { data: abc, isLoading: abcLoading } = useMachineABC()
  const { data: frauds } = useFraudAlerts()
  const { data: projects } = useProjectCost()

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="รายงาน"
        subtitle="Export Excel / PDF · สรุปต้นทุนและการเคลื่อนไหว"
        actions={<Btn>Export ทั้งหมด</Btn>}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map(r => (
          <Card key={r.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md">
            <div className="text-[14px] font-bold">{r.name}</div>
            <div className="mt-1 text-[12px] text-muted">{r.desc}</div>
            <div className="mt-3 text-[12px] font-semibold text-link">เปิดรายงาน →</div>
          </Card>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="ต้นทุนเบิกเดือนนี้" value={fmtMoney(kpi?.monthlyWithdrawCost ?? 0)} accent="#2a7de1" />
        <KpiCard label="มูลค่าสต็อก" value={fmtMoney(kpi?.totalStockValue ?? 0)} accent="#64748b" />
        <KpiCard label="ส่วนต่างตรวจนับ" value={fmtMoney(kpi?.cycleVarianceValue ?? 0)} hintTone="warn" accent="#d99a2b" />
        <KpiCard label="รอซิงก์" value={String(kpi?.pendingSyncCount ?? 0)} accent="#d6493b" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 font-bold text-sm">ต้นทุนตามเครื่องจักร (ABC)</div>
          {abcLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-surface" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={abc ?? []}>
                <XAxis dataKey="machineCode" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="totalCost" fill="#2a7de1" radius={[4, 4,  0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 font-bold text-sm">รายการผิดปกติ</div>
          <div className="space-y-2">
            {(frauds ?? []).map(f => (
              <div
                key={f.type}
                className={`flex justify-between rounded-lg px-3 py-2 text-sm ${
                  f.severity === 'HIGH' ? 'border border-red-200 bg-red-50 text-red-900' : 'border border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <span>
                  {f.type === 'CROSS_PROJECT' ? 'เบิกข้ามโครงการ'
                    : f.type === 'ADJUST_NO_REASON' ? 'ปรับยอดไม่มีเหตุผล'
                      : 'Handshake ฝ่ายเดียว'}
                </span>
                <span className="font-bold">{f.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-4 font-bold text-sm">สัดส่วนต้นทุนตามโครงการ</div>
        <div className="space-y-3">
          {(projects ?? []).map(p => (
            <div key={p.costCenterId}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold">{p.projectName}</span>
                <span className="text-muted">{fmtMoney(p.totalCost)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full" style={{ width: `${p.percentage}%`, background: p.color }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
