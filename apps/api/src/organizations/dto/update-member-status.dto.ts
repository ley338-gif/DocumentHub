import { IsIn } from "class-validator";

export class UpdateMemberStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED"])
  status!: "ACTIVE" | "SUSPENDED";
}
