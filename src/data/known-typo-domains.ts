/**
 * Known typosquat domains mapped to the provider the user likely meant.
 * Add entries as Mailchimp or other downstream integrations surface them.
 */
export const KNOWN_TYPO_DOMAINS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "yhoo.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
};
