import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must be lowercase alphanumeric with hyphens" })
  slug?: string;
}
