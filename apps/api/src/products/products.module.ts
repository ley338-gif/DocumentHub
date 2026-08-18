import { Module } from "@nestjs/common";
import {
  BatchesController,
  ProductFamiliesController,
  ProductsController,
  UnitsController,
} from "./products.controller";
import { ProductQrController, UnitQrController } from "./qr.controller";
import { ProductsService } from "./products.service";
import { QrService } from "./qr.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [
    ProductFamiliesController,
    ProductsController,
    BatchesController,
    UnitsController,
    ProductQrController,
    UnitQrController,
  ],
  providers: [ProductsService, QrService],
  exports: [ProductsService],
})
export class ProductsModule {}
