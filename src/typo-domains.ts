import { KNOWN_TYPO_DOMAINS } from "./data/known-typo-domains";

export function isKnownTypoDomain(registrableDomain: string): boolean {
  return registrableDomain.toLowerCase() in KNOWN_TYPO_DOMAINS;
}

export function getKnownTypoSuggestion(registrableDomain: string): string | null {
  return KNOWN_TYPO_DOMAINS[registrableDomain.toLowerCase()] ?? null;
}
