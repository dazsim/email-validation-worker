const DNS_MX_TYPE = 15;
const DNS_A_TYPE = 1;
const DNS_AAAA_TYPE = 28;
const CACHE_TTL_SECONDS = 3600;

interface DnsAnswer {
  type?: number;
  data?: string;
}

interface DnsResponse {
  Status?: number;
  Answer?: DnsAnswer[];
}

export interface MxHost {
  priority: number;
  host: string;
}

export interface MxLookupResult {
  ok: boolean;
  records: string[];
  hosts: MxHost[];
  nullMx: boolean;
  usedARecordFallback: boolean;
}

interface CachedMxLookup {
  ok: boolean;
  records: string[];
  hosts: MxHost[];
  nullMx: boolean;
  usedARecordFallback: boolean;
}

async function readCache<T>(cache: KVNamespace | undefined, key: string): Promise<T | null> {
  if (!cache) {
    return null;
  }

  const raw = await cache.get(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeCache(
  cache: KVNamespace | undefined,
  key: string,
  value: unknown,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
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

function normalizeMxHost(data: string): string {
  const parts = data.trim().split(/\s+/);
  const host = parts[parts.length - 1] ?? "";
  return host.replace(/\.$/, "").toLowerCase();
}

function parseMxPriority(data: string): number {
  const parts = data.trim().split(/\s+/);
  const priority = Number(parts[0]);
  return Number.isFinite(priority) ? priority : 0;
}

export function isNullMxHost(host: string): boolean {
  return host === "" || host === ".";
}

function parseMxHosts(answers: DnsAnswer[] | undefined): MxHost[] {
  if (!answers) {
    return [];
  }

  return answers
    .filter((answer) => answer.type === DNS_MX_TYPE && typeof answer.data === "string")
    .map((answer) => {
      const data = answer.data as string;
      return {
        priority: parseMxPriority(data),
        host: normalizeMxHost(data),
      };
    })
    .sort((a, b) => a.priority - b.priority);
}

function formatMxRecords(hosts: MxHost[]): string[] {
  return hosts.map((entry) => `${entry.priority} ${entry.host}.`);
}

async function lookupMxUncached(domain: string): Promise<MxLookupResult> {
  const mxResponse = await queryDns(domain, DNS_MX_TYPE);
  if (!mxResponse) {
    return {
      ok: false,
      records: [],
      hosts: [],
      nullMx: false,
      usedARecordFallback: false,
    };
  }

  const hosts = parseMxHosts(mxResponse.Answer);
  if (hosts.length > 0) {
    const nullMx = hosts.every((entry) => isNullMxHost(entry.host));
    if (nullMx) {
      return {
        ok: false,
        records: formatMxRecords(hosts),
        hosts,
        nullMx: true,
        usedARecordFallback: false,
      };
    }

    return {
      ok: true,
      records: formatMxRecords(hosts),
      hosts,
      nullMx: false,
      usedARecordFallback: false,
    };
  }

  const aResponse = await queryDns(domain, DNS_A_TYPE);
  if (!aResponse || aResponse.Status !== 0) {
    return {
      ok: false,
      records: [],
      hosts: [],
      nullMx: false,
      usedARecordFallback: false,
    };
  }

  const hasARecord = (aResponse.Answer ?? []).some((answer) => answer.type === DNS_A_TYPE);
  return {
    ok: hasARecord,
    records: [],
    hosts: [],
    nullMx: false,
    usedARecordFallback: hasARecord,
  };
}

export async function lookupMx(
  domain: string,
  cache?: KVNamespace,
): Promise<MxLookupResult> {
  const cacheKey = `dns:mx:${domain}`;
  const cached = await readCache<CachedMxLookup>(cache, cacheKey);
  if (cached) {
    return cached;
  }

  const result = await lookupMxUncached(domain);
  await writeCache(cache, cacheKey, result);
  return result;
}

async function hostResolvesUncached(hostname: string): Promise<boolean> {
  if (isNullMxHost(hostname)) {
    return false;
  }

  const aResponse = await queryDns(hostname, DNS_A_TYPE);
  if (aResponse?.Status === 0) {
    const hasA = (aResponse.Answer ?? []).some((answer) => answer.type === DNS_A_TYPE);
    if (hasA) {
      return true;
    }
  }

  const aaaaResponse = await queryDns(hostname, DNS_AAAA_TYPE);
  if (aaaaResponse?.Status === 0) {
    return (aaaaResponse.Answer ?? []).some((answer) => answer.type === DNS_AAAA_TYPE);
  }

  return false;
}

export async function mxHostsResolve(
  hosts: MxHost[],
  usedARecordFallback: boolean,
  domain: string,
  cache?: KVNamespace,
): Promise<boolean> {
  if (usedARecordFallback) {
    return true;
  }

  if (hosts.length === 0) {
    return false;
  }

  for (const entry of hosts) {
    const cacheKey = `dns:resolve:${entry.host}`;
    const cached = await readCache<{ resolves: boolean }>(cache, cacheKey);
    const resolves = cached?.resolves ?? (await hostResolvesUncached(entry.host));

    if (!cached) {
      await writeCache(cache, cacheKey, { resolves });
    }

    if (!resolves) {
      return false;
    }
  }

  return true;
}
