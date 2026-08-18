import { Module } from "@nestjs/common";
import {
  BatchesController,
  ProductFamiliesController,
  ProductsController,
  UnitsController,
} from "./products.controller";
import { ProductsService } from "./products.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [ProductFamiliesController, ProductsController, BatchesController, UnitsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
