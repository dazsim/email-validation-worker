import { parse } from "tldts";
import { lookupMx, mxHostsResolve } from "./dns";
import { isDisposableDomain } from "./disposable";
import type { ValidateResponse, ValidationChecks } from "./types";
import { getKnownTypoSuggestion, isKnownTypoDomain } from "./typo-domains";
import { collectWarnings } from "./warnings";

const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const DOMAIN_MAX_LENGTH = 253;

const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_PART_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidSyntax(email: string): boolean {
  if (!email || email.length > EMAIL_MAX_LENGTH) {
    return false;
  }

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) {
    return false;
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!local || !domain || local.length > LOCAL_MAX_LENGTH) {
    return false;
  }

  if (domain.length > DOMAIN_MAX_LENGTH || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }

  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return false;
  }

  if (domain.includes("..")) {
    return false;
  }

  return LOCAL_PART_PATTERN.test(local) && DOMAIN_PART_PATTERN.test(domain);
}

function getRegistrableDomain(domain: string): string | null {
  const { publicSuffix, domain: registrableDomain, isIcann, isPrivate } = parse(domain, {
    allowPrivateDomains: true,
  });

  if (!publicSuffix || !registrableDomain) {
    return null;
  }

  if (isIcann !== true && isPrivate !== true) {
    return null;
  }

  return registrableDomain;
}

function failedChecks(overrides: Partial<ValidationChecks> = {}): ValidationChecks {
  return {
    syntax: false,
    public_suffix: false,
    mx: false,
    mx_resolves: false,
    not_disposable: false,
    ...overrides,
  };
}

function buildResponse(
  email: string,
  valid: boolean,
  checks: ValidationChecks,
  options: {
    reason?: string;
    mxRecords?: string[];
    warnings?: ValidateResponse["warnings"];
    typoSuggestion?: string;
    domain?: string;
  } = {},
): ValidateResponse {
  const response: ValidateResponse = {
    email,
    valid,
    checks,
  };

  if (options.mxRecords && options.mxRecords.length > 0) {
    response.mx_records = options.mxRecords;
  }

  if (options.reason) {
    response.reason = options.reason;
  }

  const warningData =
    options.warnings || options.typoSuggestion
      ? { warnings: options.warnings, typoSuggestion: options.typoSuggestion }
      : options.domain
        ? collectWarnings(email, options.domain)
        : null;

  if (warningData?.warnings && warningData.warnings.length > 0) {
    response.warnings = warningData.warnings;
  }

  if (warningData?.typoSuggestion) {
    response.typo_suggestion = warningData.typoSuggestion;
  }

  return response;
}

export async function validateEmail(rawEmail: string, env: Env): Promise<ValidateResponse> {
  const email = normalizeEmail(rawEmail);

  if (!isValidSyntax(email)) {
    return buildResponse(email, false, failedChecks({ syntax: false }), {
      reason: "invalid_syntax",
    });
  }

  const domain = email.slice(email.indexOf("@") + 1);
  const registrableDomain = getRegistrableDomain(domain);

  if (!registrableDomain) {
    return buildResponse(email, false, failedChecks({ syntax: true }), {
      reason: "invalid_public_suffix",
    });
  }

  if (isDisposableDomain(registrableDomain)) {
    return buildResponse(
      email,
      false,
      failedChecks({
        syntax: true,
        public_suffix: true,
        not_disposable: false,
      }),
      { reason: "disposable" },
    );
  }

  if (isKnownTypoDomain(registrableDomain)) {
    return buildResponse(
      email,
      false,
      failedChecks({
        syntax: true,
        public_suffix: true,
        not_disposable: true,
      }),
      {
        reason: "known_typo_domain",
        typoSuggestion: getKnownTypoSuggestion(registrableDomain) ?? undefined,
      },
    );
  }

  const mxResult = await lookupMx(domain, env.CACHE);

  if (mxResult.nullMx) {
    return buildResponse(
      email,
      false,
      failedChecks({
        syntax: true,
        public_suffix: true,
        not_disposable: true,
        mx: false,
      }),
      { reason: "null_mx", mxRecords: mxResult.records, domain },
    );
  }

  if (!mxResult.ok) {
    return buildResponse(
      email,
      false,
      failedChecks({
        syntax: true,
        public_suffix: true,
        not_disposable: true,
        mx: false,
      }),
      { reason: "no_mx_records", domain },
    );
  }

  const mxResolves = await mxHostsResolve(
    mxResult.hosts,
    mxResult.usedARecordFallback,
    domain,
    env.CACHE,
  );

  if (!mxResolves) {
    return buildResponse(
      email,
      false,
      failedChecks({
        syntax: true,
        public_suffix: true,
        not_disposable: true,
        mx: true,
        mx_resolves: false,
      }),
      {
        reason: "mx_host_unresolvable",
        mxRecords: mxResult.records,
        domain,
      },
    );
  }

  const { warnings, typoSuggestion } = collectWarnings(email, domain);

  return buildResponse(
    email,
    true,
    {
      syntax: true,
      public_suffix: true,
      mx: true,
      mx_resolves: true,
      not_disposable: true,
    },
    {
      mxRecords: mxResult.records,
      warnings,
      typoSuggestion,
    },
  );
}
