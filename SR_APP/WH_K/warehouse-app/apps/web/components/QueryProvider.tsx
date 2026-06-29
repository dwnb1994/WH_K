'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
  }))
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <QueryClientProvider client={client}>{children as any}</QueryClientProvider>
  )
}
