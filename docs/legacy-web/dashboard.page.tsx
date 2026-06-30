'use client'

import {
  useDashboardKPI, useMachineABC, useFraudAlerts, useProjectCost,
} from '@warehouse/api-client/hooks'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function DashboardPage() {
  const { data: kpi,      isLoading: kpiLoading   } = useDashboardKPI()
  const { data: abc,      isLoading: abcLoading   } = useMachineABC()
  const { data: frauds,   isLoading: fraudLoading } = useFraudAlerts()
  const { data: projects, isLoading: projLoading  } = useProjectCost()

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `฿${(n / 1_000_000).toFixed(1)}M`
      : `฿${n.toLocaleString()}`

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <i className="fa-solid fa-chart-line text-blue-600 mr-2" />
          แดชบอร์ดต้นทุน
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Activity-Based Costing จาก Cost Snapshot ที่ล็อกแล้ว
        </p>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {kpiLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border rounded-xl p-4 animate-pulse h-24" />
            ))
          : [
              { label: 'ต้นทุนเบิกเดือนนี้', value: fmt(kpi!.monthlyWithdrawCost), accent: '#2563EB', icon: 'fa-coins' },
              { label: 'มูลค่าสต็อก 2 คลังโรงครัว', value: fmt(kpi!.totalStockValue), accent: '#64748B', icon: 'fa-warehouse' },
              { label: 'รอซิงค์', value: String(kpi!.pendingSyncCount), accent: '#2563EB', icon: 'fa-cloud-arrow-up' },
              { label: 'ส่วนต่างตรวจนับ', value: fmt(kpi!.cycleVarianceValue), accent: '#D97706', icon: 'fa-triangle-exclamation' },
            ].map(card => (
              <div
                key={card.label}
                className="bg-white border rounded-xl p-4"
                style={{ borderLeft: `4px solid ${card.accent}` }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-600">{card.label}</span>
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                    style={{ background: `${card.accent}18`, color: card.accent }}
                  >
                    <i className={`fa-solid ${card.icon}`} />
                  </span>
                </div>
                <div className="text-2xl font-extrabold">{card.value}</div>
              </div>
            ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* ABC Bar Chart */}
        <div className="col-span-3 bg-white border rounded-xl p-4">
          <div className="font-bold text-sm mb-1">ต้นทุนตามเครื่องจักร (ABC)</div>
          <div className="text-xs text-slate-400 mb-4">ค่าอะไหล่+ซ่อมบำรุงที่ผูก WO เดือนนี้</div>
          {abcLoading ? (
            <div className="h-40 animate-pulse bg-slate-100 rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={abc} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="machineCode" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="totalCost" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Fraud Alerts */}
        <div className="col-span-2 bg-white border rounded-xl p-4">
          <div className="font-bold text-sm mb-1">รายการผิดปกติ</div>
          <div className="text-xs text-slate-400 mb-4">จาก Handshake + Soft Block</div>
          {fraudLoading
            ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse bg-slate-100 rounded-lg" />)}</div>
            : (
              <div className="space-y-2">
                {frauds?.map(f => (
                  <div
                    key={f.type}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                    style={{
                      background: f.severity === 'HIGH' ? '#FEF2F2' : '#FFFBEB',
                      border: `1px solid ${f.severity === 'HIGH' ? '#FECACA' : '#FDE68A'}`,
                      color: f.severity === 'HIGH' ? '#991B1B' : '#92400E',
                    }}
                  >
                    <span>{f.type === 'CROSS_PROJECT' ? 'เบิกข้ามโครงการ' : f.type === 'ADJUST_NO_REASON' ? 'ปรับยอดไม่มีเหตุผล' : 'Handshake ฝ่ายเดียว'}</span>
                    <span className="font-bold">{f.count}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* ── Project Cost Breakdown ── */}
      <div className="bg-white border rounded-xl p-4">
        <div className="font-bold text-sm mb-4">สัดส่วนต้นทุนตามโครงการ (Cost Center)</div>
        {projLoading
          ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-6 animate-pulse bg-slate-100 rounded" />)}</div>
          : (
            <div className="space-y-3">
              {projects?.map(p => (
                <div key={p.costCenterId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold">{p.projectName}</span>
                    <span className="text-slate-500">{fmt(p.totalCost)}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.percentage}%`, background: p.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        <div className="mt-4 bg-blue-50 text-blue-700 text-xs rounded-lg px-3 py-2 flex gap-2 items-center">
          <i className="fa-solid fa-lock" />
          ทุกตัวเลขมาจาก Cost Snapshot ที่ล็อกราคา ณ วันเบิก — ปิดงบได้เร็ว ไม่ต้องเดาราคาย้อนหลัง
        </div>
      </div>
    </div>
  )
}
