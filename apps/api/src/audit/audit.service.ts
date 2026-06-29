import { Injectable } from '@nestjs/common'
import type { AuditAction } from '@warehouse/types'
import { DatabaseService } from '../database/database.service'

interface AuditInput {
  action: AuditAction
  entityType: string
  entityId: string
  userId: string
  details?: Record<string, unknown>
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async log(input: AuditInput): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.action,
        input.entityType,
        input.entityId,
        input.userId,
        JSON.stringify(input.details ?? {}),
      ],
    )
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.db.query(
      `SELECT al.*, e.name AS employee_name, e.code AS employee_code
       FROM audit_logs al
       LEFT JOIN employees e ON e.id::text = al.user_id
       WHERE al.entity_type = $1 AND al.entity_id = $2
       ORDER BY al.created_at DESC`,
      [entityType, entityId],
    )
  }

  async findRecent(limit = 50) {
    return this.db.query(
      `SELECT al.*, e.name AS employee_name, e.code AS employee_code
       FROM audit_logs al
       LEFT JOIN employees e ON e.id::text = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit],
    )
  }
}
