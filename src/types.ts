export interface ValidateRequest {
  email: string;
}

export type ValidationWarning = "role_address" | "possible_typo";

export interface ValidationChecks {
  syntax: boolean;
  public_suffix: boolean;
  mx: boolean;
  mx_resolves: boolean;
  not_disposable: boolean;
}

export interface ValidateResponse {
  email: string;
  valid: boolean;
  checks: ValidationChecks;
  mx_records?: string[];
  reason?: string;
  warnings?: ValidationWarning[];
  typo_suggestion?: string;
}

export interface ErrorResponse {
  error: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}
