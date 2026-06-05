const US_PHONE_DIGITS = 10;

export function phoneDigits(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const nationalDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return nationalDigits.slice(0, US_PHONE_DIGITS);
}

export function formatPhoneNumber(value?: string | null) {
  const digits = phoneDigits(value);

  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
