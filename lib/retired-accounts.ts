const RETIRED_ACCOUNT_DOMAINS = new Set([
  "nexusrentals.local",
  "northstar.local"
]);

export function isRetiredAccountEmail(value: string) {
  const email = value.trim().toLowerCase();
  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex < 1) return false;

  return RETIRED_ACCOUNT_DOMAINS.has(email.slice(separatorIndex + 1));
}
