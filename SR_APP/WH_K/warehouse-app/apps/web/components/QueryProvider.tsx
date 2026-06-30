'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WarehouseProvider } from '../lib/warehouse-context'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  }))
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <QueryClientProvider client={client}>
      <WarehouseProvider>{children as any}</WarehouseProvider>
    </QueryClientProvider>
  )
}
