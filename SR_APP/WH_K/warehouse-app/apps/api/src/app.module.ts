import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { DatabaseProvider } from './database/database.provider'
import { DatabaseService } from './database/database.service'
import { AuditService } from './audit/audit.service'
import { WarehouseService } from './warehouse/warehouse.service'
import { WarehouseController } from './warehouse/warehouse.controller'
import { TRCloudService } from './trcloud/trcloud.service'
import { TRCloudPoService } from './trcloud/trcloud-po.service'
import { SyncService } from './sync/sync.service'
import { ReportsService } from './reports/reports.service'
import { ReportsController } from './reports/reports.controller'
import { SyncController } from './sync/sync.controller'
import { TRCloudDocsService } from './trcloud/trcloud-docs.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
  ],
  controllers: [WarehouseController, ReportsController, SyncController],
  providers: [
    DatabaseProvider,
    DatabaseService,
    AuditService,
    WarehouseService,
    TRCloudService,
    TRCloudPoService,
    TRCloudDocsService,
    SyncService,
    ReportsService,
  ],
})
export class AppModule {}
