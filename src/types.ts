export interface ValidateRequest {
  email: string;
}

export interface ValidationChecks {
  syntax: boolean;
  mx: boolean;
}

export interface ValidateResponse {
  email: string;
  valid: boolean;
  checks: ValidationChecks;
  mx_records?: string[];
  reason?: string;
}

export interface ErrorResponse {
  error: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}
