import { NestFactory } from '@nestjs/core'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' })
  app.setGlobalPrefix('api/v1')

  const doc = new DocumentBuilder()
    .setTitle('MWM Warehouse API')
    .setDescription('Mine Warehouse Management — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc))

  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
