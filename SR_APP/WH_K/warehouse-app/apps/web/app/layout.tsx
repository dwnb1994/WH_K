import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import { QueryProvider } from '../components/QueryProvider'
import './globals.css'

const notoThai = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-thai',
})

export const metadata: Metadata = {
  title: 'คลังสำรับลาว',
  description: 'Kitchen Pantry — ต้นทุน real-time · TRCloud Sync',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
