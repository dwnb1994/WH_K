export type MapMode = 'in' | 'out'

export interface MapItem {
  name: string
  sku: string
  doc: string
  qty: number
  unit: string
  date: string
}

export interface MapBox {
  id: string
  label: string
  code: string
  itemsIn: MapItem[]
  itemsOut: MapItem[]
}

export const WAREHOUSE_MAP: MapBox[] = [
  {
    id: 'box1', label: 'A-01', code: 'A-01',
    itemsIn: [{ name: 'สว่านไร้สาย 18V พร้อมแบต', sku: 'TL-0241', doc: 'PO-2406-017', qty: 20, unit: 'เครื่อง', date: '18 มิ.ย. 10:22' }],
    itemsOut: [{ name: 'สว่านไร้สาย 18V พร้อมแบต', sku: 'TL-0241', doc: 'MR-2406-204', qty: 6, unit: 'เครื่อง', date: '19 มิ.ย. 14:12' }],
  },
  {
    id: 'box5', label: 'A-05', code: 'A-05',
    itemsIn: [
      { name: 'เทปพันสายไฟ (แพ็ค 10)', sku: 'CS-0102', doc: 'PO-2406-016', qty: 60, unit: 'แพ็ค', date: '17 มิ.ย. 14:08' },
      { name: 'น็อตล็อค M8 ไนล่อน', sku: 'FX-3310', doc: 'PO-2406-019', qty: 500, unit: 'ชิ้น', date: '19 มิ.ย. 09:30' },
    ],
    itemsOut: [],
  },
  {
    id: 'box13', label: 'A-13', code: 'A-13',
    itemsIn: [
      { name: 'น็อตหัวจม M8 × 40', sku: 'FX-1180', doc: 'PO-2406-018', qty: 40, unit: 'กล่อง', date: '19 มิ.ย. 13:42' },
      { name: 'น็อตตัวเมีย M8', sku: 'FX-2204', doc: 'PO-2406-018', qty: 500, unit: 'ชิ้น', date: '19 มิ.ย. 13:45' },
      { name: 'แหวนสปริง M8', sku: 'FX-2208', doc: 'PO-2406-016', qty: 300, unit: 'ชิ้น', date: '17 มิ.ย. 09:20' },
      { name: 'สกรูเกลียวปล่อย #14 × 3"', sku: 'FX-5021', doc: 'PO-2406-015', qty: 120, unit: 'กล่อง', date: '16 มิ.ย. 10:05' },
    ],
    itemsOut: [
      { name: 'น็อตหัวจม M8 × 40', sku: 'FX-1180', doc: 'MR-2406-204', qty: 4, unit: 'กล่อง', date: '19 มิ.ย. 14:14' },
    ],
  },
  {
    id: 'box20', label: 'B-20', code: 'B-20',
    itemsIn: [
      { name: 'ไขควงไฟฟ้า 12V', sku: 'TL-0118', doc: 'PO-2406-017', qty: 12, unit: 'เครื่อง', date: '18 มิ.ย. 10:25' },
      { name: 'ดอกสว่าน HSS ชุด 19 ดอก', sku: 'TL-0902', doc: 'PO-2406-016', qty: 15, unit: 'ชุด', date: '17 มิ.ย. 11:40' },
    ],
    itemsOut: [],
  },
  {
    id: 'box22', label: 'B-22', code: 'B-22',
    itemsIn: [{ name: 'ประแจปอนด์ 1/2"', sku: 'TL-0610', doc: 'PO-2406-014', qty: 8, unit: 'อัน', date: '15 มิ.ย. 16:12' }],
    itemsOut: [],
  },
]

export const MAP_TOP_IDS = ['box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9']
export const MAP_LEFT_IDS = ['box10', 'box11', 'box12', 'box13', 'box14', 'box15', 'box16', 'box17', 'box18']
export const MAP_RIGHT_IDS = ['box19', 'box20', 'box21', 'box22', 'box23', 'box24', 'box25', 'box26', 'box27']

export function getMapBox(id: string): MapBox | undefined {
  return WAREHOUSE_MAP.find(b => b.id === id)
}
