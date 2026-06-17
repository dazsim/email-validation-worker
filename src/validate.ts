import { parse } from "tldts";
import type { ValidateResponse } from "./types";

const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const DOMAIN_MAX_LENGTH = 253;

const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_PART_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

interface DnsAnswer {
  type?: number;
  data?: string;
}

interface DnsResponse {
  Status?: number;
  Answer?: DnsAnswer[];
}

const DNS_MX_TYPE = 15;
const DNS_A_TYPE = 1;

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

function hasValidPublicSuffix(domain: string): boolean {
  const { publicSuffix, domain: registrableDomain, isIcann, isPrivate } = parse(domain, {
    allowPrivateDomains: true,
  });

  if (!publicSuffix || !registrableDomain) {
    return false;
  }

  return isIcann === true || isPrivate === true;
}

function extractDomain(email: string): string {
  return email.slice(email.indexOf("@") + 1);
}

function parseMxRecords(answers: DnsAnswer[] | undefined): string[] {
  if (!answers) {
    return [];
  }

  return answers
    .filter((answer) => answer.type === DNS_MX_TYPE && typeof answer.data === "string")
    .map((answer) => answer.data as string)
    .sort();
}

async function queryDns(domain: string, type: number): Promise<DnsResponse | null> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", domain);
  url.searchParams.set("type", String(type));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/dns-json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DnsResponse;
  } catch {
    return null;
  }
}

async function hasMxRecords(domain: string): Promise<{ ok: boolean; records: string[] }> {
  const mxResponse = await queryDns(domain, DNS_MX_TYPE);
  if (!mxResponse) {
    return { ok: false, records: [] };
  }

  const mxRecords = parseMxRecords(mxResponse.Answer);
  if (mxRecords.length > 0) {
    return { ok: true, records: mxRecords };
  }

  const aResponse = await queryDns(domain, DNS_A_TYPE);
  if (!aResponse || aResponse.Status !== 0) {
    return { ok: false, records: [] };
  }

  const hasARecord = (aResponse.Answer ?? []).some((answer) => answer.type === DNS_A_TYPE);
  return { ok: hasARecord, records: [] };
}

export async function validateEmail(rawEmail: string): Promise<ValidateResponse> {
  const email = normalizeEmail(rawEmail);

  if (!isValidSyntax(email)) {
    return {
      email,
      valid: false,
      checks: { syntax: false, mx: false },
      reason: "invalid_syntax",
    };
  }

  const domain = extractDomain(email);

  if (!hasValidPublicSuffix(domain)) {
    return {
      email,
      valid: false,
      checks: { syntax: false, mx: false },
      reason: "invalid_public_suffix",
    };
  }

  const mxResult = await hasMxRecords(domain);

  if (!mxResult.ok) {
    return {
      email,
      valid: false,
      checks: { syntax: true, mx: false },
      reason: "no_mx_records",
    };
  }

  return {
    email,
    valid: true,
    checks: { syntax: true, mx: true },
    mx_records: mxResult.records.length > 0 ? mxResult.records : undefined,
  };
}
