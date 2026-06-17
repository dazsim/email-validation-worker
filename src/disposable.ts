import { DISPOSABLE_DOMAINS } from "./data/disposable-domains";

export function isDisposableDomain(registrableDomain: string): boolean {
  return DISPOSABLE_DOMAINS.has(registrableDomain.toLowerCase());
}
