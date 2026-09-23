import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PropertiesController } from './properties.controller';
import { TalhoesController } from './talhoes.controller';
import { CropTypesController } from './crop-types.controller';
import { EstadiosController } from './estadios.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController, TalhoesController, CropTypesController, EstadiosController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
