import { useState } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useStock, useCreateWithdraw } from '@warehouse/api-client/hooks'
import { useSyncEngine } from '../../hooks/useSyncEngine'
import type { StockPosition } from '@warehouse/types'

interface CartItem {
  position: StockPosition
  qty: number
  softBlockReason?: string
}

export default function DispatchScreen() {
  const { sku } = useLocalSearchParams<{ sku?: string }>()
  const [woNumber, setWoNumber] = useState('')
  const [search, setSearch] = useState(sku ?? '')
  const [cart, setCart] = useState<CartItem[]>([])

  const { data: stock, isLoading } = useStock(undefined, search)
  const createWithdraw = useCreateWithdraw()
  const { enqueue, pendingCount } = useSyncEngine()

  const addToCart = (pos: StockPosition) => {
    if (cart.find(c => c.position.id === pos.id)) return
    setCart(prev => [...prev, { position: pos, qty: 1 }])
  }

  const updateQty = (id: string, delta: number) =>
    setCart(prev => prev.map(c =>
      c.position.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c,
    ))

  const removeFromCart = (id: string) =>
    setCart(prev => prev.filter(c => c.position.id !== id))

  const handleConfirm = async () => {
    if (!woNumber.trim()) { Alert.alert('', 'กรุณาระบุเลข WO'); return }
    if (cart.length === 0) { Alert.alert('', 'เพิ่มพัสดุก่อนยืนยัน'); return }

    const offlineId = `MOBILE-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const payload = {
      offlineId,
      woId: woNumber,         // จะ resolve จาก WO number ฝั่ง backend
      requesterId: 'current-user-id',
      lines: cart.map(c => ({
        itemId: c.position.itemId,
        warehouseId: c.position.warehouseId,
        qty: c.qty,
        softBlockReason: c.softBlockReason as any,
      })),
    }

    try {
      // ลอง online ก่อน — ถ้าไม่มีเน็ตจะ fallback ไป offline queue
      await createWithdraw.mutateAsync(payload)
      Alert.alert('✓', 'บันทึกรายการเบิกแล้ว — รอ Digital Handshake')
      setCart([])
    } catch {
      // Offline fallback
      await enqueue('GI', payload)
      Alert.alert(
        'บันทึกออฟไลน์',
        `ไม่มีสัญญาณ — เก็บ ${offlineId.slice(-8)} ไว้ sync เมื่อมีเน็ต`,
      )
      setCart([])
    }
  }

  const totalCost = cart.reduce(
    (s, c) => s + c.qty * (c.position as any).cost ?? 0,
    0,
  )

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 120 }}>

      {/* Sync Chip */}
      {pendingCount > 0 && (
        <View style={styles.syncChip}>
          <Text style={styles.syncText}>● {pendingCount} รายการรอซิงค์</Text>
        </View>
      )}

      {/* WO Bar */}
      <View style={styles.card}>
        <Text style={styles.label}>ใบสั่งซ่อม (WO)</Text>
        <TextInput
          style={styles.input}
          value={woNumber}
          onChangeText={setWoNumber}
          placeholder="WO-2025-xxxx"
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* Catalog */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>เลือกพัสดุ</Text>
        <TextInput
          style={[styles.input, { marginBottom: 12 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="ค้นหารหัส / ชื่อพัสดุ"
          placeholderTextColor="#94A3B8"
        />
        {isLoading
          ? <ActivityIndicator color="#2563EB" />
          : stock?.map(pos => (
              <View key={pos.id} style={styles.catalogRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{(pos as any).item?.name}</Text>
                  <Text style={styles.itemMeta}>
                    {(pos as any).item?.sku} · คลัง {(pos as any).warehouse?.code} · เหลือ {pos.onHand}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, cart.find(c => c.position.id === pos.id) && styles.addBtnDone]}
                  onPress={() => addToCart(pos)}
                >
                  <Text style={styles.addBtnText}>
                    {cart.find(c => c.position.id === pos.id) ? '✓ เพิ่มแล้ว' : '+ เพิ่ม'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
      </View>

      {/* Cart */}
      {cart.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>รายการเบิก ({cart.length})</Text>
          {cart.map(c => (
            <View key={c.position.id} style={styles.cartRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{(c.position as any).item?.name}</Text>
                <Text style={styles.itemMeta}>คลัง {(c.position as any).warehouse?.code}</Text>
              </View>
              <View style={styles.qtyRow}>
                <TouchableOpacity onPress={() => updateQty(c.position.id, -1)} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyNum}>{c.qty}</Text>
                <TouchableOpacity onPress={() => updateQty(c.position.id, 1)} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeFromCart(c.position.id)}>
                <Text style={{ color: '#94A3B8', fontSize: 16, marginLeft: 10 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Summary + Confirm */}
          <View style={styles.summary}>
            <View>
              <Text style={{ fontSize: 11, color: '#94A3B8' }}>มูลค่ารวม</Text>
              <Text style={styles.totalCost}>฿{totalCost.toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmBtn, createWithdraw.isPending && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={createWithdraw.isPending}
            >
              {createWithdraw.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>ยืนยันการเบิก →</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  syncChip: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 8, padding: 8, marginBottom: 12 },
  syncText: { fontSize: 12, color: '#B45309', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 14 },
  label: { fontSize: 11, color: '#94A3B8', marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC', color: '#0F172A' },
  catalogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  itemName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  itemMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  addBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFD3FB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnDone: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden' },
  qtyBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  qtyBtnText: { fontSize: 16, color: '#475569' },
  qtyNum: { width: 36, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', borderStyle: 'dashed' },
  totalCost: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  confirmBtn: { backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 13, borderRadius: 10 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
