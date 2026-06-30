import { Injectable } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

export interface SyncEvent {
  runId: string
  docTypes: string[]
  syncedAt: string
}

@Injectable()
export class SyncEventsService {
  private readonly subject = new Subject<SyncEvent>()

  events$(): Observable<SyncEvent> {
    return this.subject.asObservable()
  }

  emit(event: SyncEvent) {
    this.subject.next(event)
  }
}
