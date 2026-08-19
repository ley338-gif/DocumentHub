// See docs/platform-administration.md "Registration Mode". INVITE_ONLY is the
// production-like default (spec: onboarding only via Invitation); SELF_SERVICE
// keeps the original open register -> create-organization flow for local dev.
export type RegistrationMode = "INVITE_ONLY" | "SELF_SERVICE";

export function registrationMode(): RegistrationMode {
  const raw = (process.env.REGISTRATION_MODE ?? "INVITE_ONLY").toUpperCase();
  return raw === "SELF_SERVICE" ? "SELF_SERVICE" : "INVITE_ONLY";
}
