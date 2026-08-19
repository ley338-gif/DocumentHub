import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsEmail()
  adminEmail!: string;
}

export class UpdateTenantStatusDto {
  @IsIn(["TRIAL", "ACTIVE", "SUSPENDED", "CLOSED"])
  status!: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED";
}
