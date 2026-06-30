'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface SyncEvent {
  runId: string
  docTypes: string[]
  syncedAt: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export function useSyncEvents(onSync?: (event: SyncEvent) => void) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const events = new EventSource(`${API_URL}/api/v1/trcloud/pull/events`)

    events.addEventListener('sync:complete', event => {
      const payload = JSON.parse((event as MessageEvent).data) as SyncEvent

      for (const docType of payload.docTypes) {
        if (docType === 'gr') queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] })
        if (docType === 'mr') queryClient.invalidateQueries({ queryKey: ['materialRequests'] })
        if (docType === 'inc') {
          queryClient.invalidateQueries({ queryKey: ['inboundCargo'] })
          queryClient.invalidateQueries({ queryKey: ['incStock'] })
        }
        if (docType === 'po') queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
      }

      queryClient.invalidateQueries({ queryKey: ['stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse'] })
      onSync?.(payload)
    })

    return () => events.close()
  }, [onSync, queryClient])
}
