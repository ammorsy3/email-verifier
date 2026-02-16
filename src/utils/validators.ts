import { disposableDomains } from "../data/disposableDomains";
import { roleAddresses } from "../data/roleAddresses";
import { freeProviders } from "../data/freeProviders";
import { domainTypos } from "../data/typos";

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}[a-zA-Z0-9])?)*$/;

export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;

  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (domain.length > 255) return false;

  return EMAIL_REGEX.test(email);
}

export function isDisposable(domain: string): boolean {
  return disposableDomains.has(domain.toLowerCase());
}

export function isRoleBasedAddress(local: string): boolean {
  return roleAddresses.has(local.toLowerCase());
}

export function isFreeProvider(domain: string): boolean {
  return freeProviders.has(domain.toLowerCase());
}

export function getSuggestedDomain(domain: string): string | null {
  return domainTypos[domain.toLowerCase()] ?? null;
}
