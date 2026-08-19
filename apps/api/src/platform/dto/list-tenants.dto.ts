import { IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination";

export class ListTenantsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["TRIAL", "ACTIVE", "SUSPENDED", "CLOSED"])
  status?: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED";
}
