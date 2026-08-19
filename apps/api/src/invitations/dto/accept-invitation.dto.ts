import { IsOptional, IsString, MinLength } from "class-validator";

/** Only required when the invited email has no existing account yet — see
 * InvitationsService.accept(). An already-registered invitee accepts by
 * being authenticated (Bearer token) instead, and sends neither field. */
export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
