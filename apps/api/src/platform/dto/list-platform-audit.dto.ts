import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

export class ListPlatformAuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;
}
