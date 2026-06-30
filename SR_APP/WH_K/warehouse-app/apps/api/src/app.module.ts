import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
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
import { SyncCacheService } from './sync/sync-cache.service'
import { SyncEventsService } from './sync/sync-events.service'
import { StaleCheckMiddleware } from './sync/stale-check.middleware'
import { TrcloudPullController } from './trcloud/trcloud-pull.controller'
import { TrcloudPullService } from './trcloud/trcloud-pull.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
  ],
  controllers: [WarehouseController, ReportsController, SyncController, TrcloudPullController],
  providers: [
    DatabaseProvider,
    DatabaseService,
    AuditService,
    WarehouseService,
    TRCloudService,
    TRCloudPoService,
    TRCloudDocsService,
    SyncCacheService,
    SyncEventsService,
    TrcloudPullService,
    SyncService,
    ReportsService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(StaleCheckMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.GET })
  }
}
