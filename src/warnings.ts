import { parse } from "tldts";
import type { ValidationWarning } from "./types";

const ROLE_LOCAL_PARTS = new Set([
  "admin",
  "administrator",
  "postmaster",
  "hostmaster",
  "webmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "root",
  "abuse",
  "security",
  "info",
  "support",
  "sales",
  "marketing",
  "contact",
  "helpdesk",
  "billing",
  "office",
]);

const COMMON_EMAIL_DOMAINS = [
  "aol.com",
  "comcast.net",
  "fastmail.com",
  "gmail.com",
  "gmx.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "verizon.net",
  "yahoo.co.uk",
  "yahoo.com",
  "yandex.com",
  "zoho.com",
];

function normalizeLocalPart(local: string): string {
  const plusIndex = local.indexOf("+");
  return plusIndex === -1 ? local : local.slice(0, plusIndex);
}

export function detectRoleAddress(email: string): boolean {
  const local = email.slice(0, email.indexOf("@"));
  return ROLE_LOCAL_PARTS.has(normalizeLocalPart(local));
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    matrix[i][0] = i;
  }

  for (let j = 0; j < cols; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function detectTypoDomain(domain: string): string | null {
  const registrableDomain = parse(domain, { allowPrivateDomains: true }).domain;
  if (!registrableDomain || COMMON_EMAIL_DOMAINS.includes(registrableDomain)) {
    return null;
  }

  for (const commonDomain of COMMON_EMAIL_DOMAINS) {
    if (levenshtein(registrableDomain, commonDomain) === 1) {
      return commonDomain;
    }
  }

  return null;
}

export function collectWarnings(email: string, domain: string): {
  warnings: ValidationWarning[];
  typoSuggestion?: string;
} {
  const warnings: ValidationWarning[] = [];

  if (detectRoleAddress(email)) {
    warnings.push("role_address");
  }

  const typoSuggestion = detectTypoDomain(domain);
  if (typoSuggestion) {
    warnings.push("possible_typo");
  }

  return {
    warnings,
    typoSuggestion: typoSuggestion ?? undefined,
  };
}
