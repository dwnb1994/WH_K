/** ใช้ข้อมูลตัวอย่าง — ปิดได้ด้วย NEXT_PUBLIC_USE_MOCK=0 */
export const useMockData =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_USE_MOCK !== '0') ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_USE_MOCK === '1')

export async function fetchOrMock<T>(apiCall: () => Promise<T>, mock: T): Promise<T> {
  if (useMockData) return mock
  try {
    return await apiCall()
  } catch {
    return mock
  }
}
