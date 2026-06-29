import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ReportsService } from './reports.service'

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPI แดชบอร์ดต้นทุน' })
  getDashboard() {
    return this.svc.getDashboardKPI()
  }

  @Get('machine-abc')
  @ApiOperation({ summary: 'ต้นทุนตามเครื่องจักร ABC' })
  getMachineABC() {
    return this.svc.getMachineABC()
  }

  @Get('fraud-alerts')
  @ApiOperation({ summary: 'รายการผิดปกติ (Fraud Prevention)' })
  getFraudAlerts() {
    return this.svc.getFraudAlerts()
  }

  @Get('project-cost')
  @ApiOperation({ summary: 'สัดส่วนต้นทุนตามโครงการ (Cost Center)' })
  getProjectCost() {
    return this.svc.getProjectCostBreakdown()
  }
}
