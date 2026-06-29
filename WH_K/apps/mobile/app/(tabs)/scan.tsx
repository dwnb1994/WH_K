import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { warehouseApi } from '@warehouse/api-client'

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)

  const handleBarcode = useCallback(async ({ data: sku }: { data: string }) => {
    if (scanned) return
    setScanned(true)

    try {
      const stock = await warehouseApi.getStock({ search: sku })
      if (stock.length === 0) {
        Alert.alert('ไม่พบพัสดุ', `ไม่พบ SKU: ${sku}`, [
          { text: 'ลองใหม่', onPress: () => setScanned(false) },
        ])
        return
      }
      // ส่งผล scan ไปยังหน้า dispatch หรือ receive
      router.push({ pathname: '/dispatch', params: { sku } })
    } catch {
      Alert.alert('Error', 'ไม่สามารถค้นหาพัสดุได้')
      setScanned(false)
    }
  }, [scanned])

  if (!permission) return <View style={styles.center}><Text>กำลังตรวจสิทธิ์กล้อง…</Text></View>

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>แอปต้องการสิทธิ์ใช้กล้องเพื่อสแกนบาร์โค้ด</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>อนุญาตกล้อง</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
      />

      {/* Viewfinder */}
      <View style={styles.overlay}>
        <View style={styles.finder} />
        <Text style={styles.hint}>
          {scanned ? 'กำลังค้นหา…' : 'เล็งบาร์โค้ดหรือ QR ของพัสดุ'}
        </Text>
      </View>

      {scanned && (
        <TouchableOpacity style={styles.resetBtn} onPress={() => setScanned(false)}>
          <Text style={styles.resetText}>สแกนใหม่</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  finder: {
    width: 260, height: 180, borderWidth: 2, borderColor: '#2563EB',
    borderRadius: 12, backgroundColor: 'transparent',
  },
  hint: { color: '#fff', marginTop: 16, fontSize: 14, fontWeight: '600' },
  permText: { textAlign: 'center', color: '#475569', fontSize: 14, marginBottom: 16 },
  btn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resetBtn: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
    backgroundColor: '#0F172A', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12,
  },
  resetText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
