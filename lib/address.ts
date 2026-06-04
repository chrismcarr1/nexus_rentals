export const DEFAULT_COUNTRY = "US";

export type Address = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type StoredAddress = Omit<Address, "country"> & {
  country?: string | null;
};

export type AddressInput = Partial<Record<keyof Address, string | null | undefined>>;

export type AddressFieldErrors = Partial<Record<keyof Address, string>>;

export type AddressValidationResult =
  | { success: true; address: Address; formattedAddress: string }
  | { success: false; errors: AddressFieldErrors; message: string };

export type OptionalAddressValidationResult =
  | { success: true; address?: Address; formattedAddress?: string }
  | { success: false; errors: AddressFieldErrors; message: string };

export type AddressFormFieldNames = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const STANDARD_ADDRESS_FORM_FIELDS = {
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  city: "city",
  state: "state",
  postalCode: "postalCode",
  country: "country"
} as const satisfies AddressFormFieldNames;

export const MAILING_ADDRESS_FORM_FIELDS = {
  addressLine1: "mailingAddressLine1",
  addressLine2: "mailingAddressLine2",
  city: "mailingCity",
  state: "mailingState",
  postalCode: "mailingPostalCode",
  country: "mailingCountry"
} as const satisfies AddressFormFieldNames;

export const ADDRESS_COUNTRY_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" }
] as const;

const ADDRESS_CONTENT_FIELDS: Array<keyof Address> = ["addressLine1", "addressLine2", "city", "state", "postalCode"];

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC"
};

const CA_PROVINCE_ABBREVIATIONS: Record<string, string> = {
  ALBERTA: "AB",
  "BRITISH COLUMBIA": "BC",
  MANITOBA: "MB",
  "NEW BRUNSWICK": "NB",
  NEWFOUNDLAND: "NL",
  "NEWFOUNDLAND AND LABRADOR": "NL",
  "NORTHWEST TERRITORIES": "NT",
  "NOVA SCOTIA": "NS",
  NUNAVUT: "NU",
  ONTARIO: "ON",
  "PRINCE EDWARD ISLAND": "PE",
  QUEBEC: "QC",
  SASKATCHEWAN: "SK",
  YUKON: "YT"
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePostalCode(value: unknown, country: string) {
  const postalCode = cleanText(value).toUpperCase();
  if (country === "CA") {
    const compact = postalCode.replace(/\s+/g, "");
    return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : postalCode;
  }
  return postalCode;
}

function normalizeState(value: unknown, country: string) {
  const state = cleanText(value);
  if (country === "US") return US_STATE_ABBREVIATIONS[state.toUpperCase()] ?? state.toUpperCase();
  if (country === "CA") return CA_PROVINCE_ABBREVIATIONS[state.toUpperCase()] ?? state.toUpperCase();
  return state;
}

export function normalizeCountry(value: unknown) {
  const country = cleanText(value);
  if (!country) return DEFAULT_COUNTRY;

  const normalized = country.toUpperCase().replace(/\./g, "");
  if (["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(normalized)) return "US";
  if (["CA", "CAN", "CANADA"].includes(normalized)) return "CA";
  return country.length <= 3 ? normalized : country;
}

export function formatCountry(countryValue?: string | null) {
  const country = normalizeCountry(countryValue);
  if (country === "US") return "United States";
  if (country === "CA") return "Canada";
  return country;
}

export function normalizeAddress(input: AddressInput | StoredAddress): Address {
  const country = normalizeCountry(input.country);

  return {
    addressLine1: cleanText(input.addressLine1),
    addressLine2: cleanText(input.addressLine2) || undefined,
    city: cleanText(input.city),
    state: normalizeState(input.state, country),
    postalCode: normalizePostalCode(input.postalCode, country),
    country
  };
}

export function hasAddressInput(input: AddressInput) {
  return ADDRESS_CONTENT_FIELDS.some((field) => Boolean(cleanText(input[field])));
}

export function getAddressValidationErrors(input: AddressInput | StoredAddress): AddressFieldErrors {
  const address = normalizeAddress(input);
  const errors: AddressFieldErrors = {};

  if (!address.addressLine1) {
    errors.addressLine1 = "Street address is required.";
  } else if (address.addressLine1.length < 3) {
    errors.addressLine1 = "Street address must be at least 3 characters.";
  }

  if (!address.city) {
    errors.city = "City is required.";
  } else if (address.city.length < 2) {
    errors.city = "City must be at least 2 characters.";
  }

  if (!address.state) {
    errors.state = "State or region is required.";
  } else if (address.country === "US" && !/^[A-Z]{2}$/.test(address.state)) {
    errors.state = "Use a two-letter US state abbreviation.";
  } else if (address.country === "CA" && !/^[A-Z]{2}$/.test(address.state)) {
    errors.state = "Use a two-letter Canadian province abbreviation.";
  } else if (address.country !== "US" && address.country !== "CA" && address.state.length < 2) {
    errors.state = "State or region must be at least 2 characters.";
  }

  if (!address.postalCode) {
    errors.postalCode = "ZIP or postal code is required.";
  } else if (address.country === "US" && !/^\d{5}(-\d{4})?$/.test(address.postalCode)) {
    errors.postalCode = "Use a 5-digit ZIP code or ZIP+4.";
  } else if (address.country === "CA" && !/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(address.postalCode)) {
    errors.postalCode = "Use a Canadian postal code like A1A 1A1.";
  } else if (address.country !== "US" && address.country !== "CA" && address.postalCode.length < 3) {
    errors.postalCode = "Postal code must be at least 3 characters.";
  }

  if (!address.country) {
    errors.country = "Country is required.";
  }

  return errors;
}

function summarizeAddressErrors(errors: AddressFieldErrors) {
  const firstError = Object.values(errors)[0];
  return firstError ?? "Review the address fields and try again.";
}

export function validateAddress(input: AddressInput | StoredAddress): AddressValidationResult {
  const address = normalizeAddress(input);
  const errors = getAddressValidationErrors(address);

  if (Object.keys(errors).length) {
    return {
      success: false,
      errors,
      message: summarizeAddressErrors(errors)
    };
  }

  return {
    success: true,
    address,
    formattedAddress: formatAddress(address)
  };
}

export function validateOptionalAddress(input: AddressInput | StoredAddress): OptionalAddressValidationResult {
  if (!hasAddressInput(input)) {
    return { success: true };
  }

  return validateAddress(input);
}

export function parseAddressText(value?: string | null): AddressInput {
  const text = cleanText(value);
  if (!text) return {};

  const parts = text
    .split(/\r?\n|,/)
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (!parts.length) return {};

  let country: string | undefined;
  const lastPart = parts[parts.length - 1];
  if (/^(US|USA|United States|United States of America|CA|CAN|Canada)$/i.test(lastPart)) {
    country = parts.pop();
  }

  const statePostal = parts.pop() ?? "";
  const statePostalMatch = statePostal.match(/^([A-Za-z]{2})\s+(.+)$/);
  const city = parts.pop() ?? "";
  const addressLine1 = parts.shift() ?? "";
  const addressLine2 = parts.length ? parts.join(", ") : undefined;

  return {
    addressLine1,
    addressLine2,
    city,
    state: statePostalMatch?.[1] ?? "",
    postalCode: statePostalMatch?.[2] ?? statePostal,
    country
  };
}

export function readAddressFormData(
  formData: FormData,
  fieldNames: AddressFormFieldNames = STANDARD_ADDRESS_FORM_FIELDS,
  legacyFieldName?: string
): AddressInput {
  const input = {
    addressLine1: cleanText(formData.get(fieldNames.addressLine1)),
    addressLine2: cleanText(formData.get(fieldNames.addressLine2)),
    city: cleanText(formData.get(fieldNames.city)),
    state: cleanText(formData.get(fieldNames.state)),
    postalCode: cleanText(formData.get(fieldNames.postalCode)),
    country: cleanText(formData.get(fieldNames.country)) || DEFAULT_COUNTRY
  };

  if (!hasAddressInput(input) && legacyFieldName) {
    return parseAddressText(String(formData.get(legacyFieldName) ?? ""));
  }

  return input;
}

export function addressToFormValue(input?: AddressInput | StoredAddress | null): AddressInput {
  return input ? normalizeAddress(input) : {};
}

type FormatAddressOptions = {
  multiline?: boolean;
  includeCountry?: boolean;
  fallback?: string;
};

export function formatAddress(input?: AddressInput | StoredAddress | null, options: FormatAddressOptions = {}) {
  if (!input) return options.fallback ?? "Address unavailable";

  const address = normalizeAddress(input);
  if (!address.addressLine1 || !address.city || !address.state || !address.postalCode) {
    return options.fallback ?? "Incomplete address";
  }

  const cityStatePostal = [address.city, [address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const parts = [address.addressLine1, address.addressLine2, cityStatePostal].filter(Boolean);

  if (options.includeCountry !== false) {
    parts.push(formatCountry(address.country));
  }

  return parts.join(options.multiline ? "\n" : ", ");
}

function unitLine(unitNumber?: string | null) {
  const unit = cleanText(unitNumber);
  if (!unit) return "";
  return /^unit\s+/i.test(unit) ? unit : `Unit ${unit}`;
}

function combineAddressLine2(addressLine2?: string | null, unitNumber?: string | null) {
  return [cleanText(addressLine2), unitLine(unitNumber)].filter(Boolean).join(", ") || undefined;
}

export function composeUnitAddress(property: AddressInput | StoredAddress, unit?: { unitNumber?: string | null } | null): Address {
  const address = normalizeAddress(property);

  return {
    ...address,
    addressLine2: combineAddressLine2(address.addressLine2, unit?.unitNumber)
  };
}

export function formatUnitAddress(
  property: AddressInput | StoredAddress,
  unit?: { unitNumber?: string | null; addressOverride?: string | null } | null,
  options: FormatAddressOptions = {}
) {
  const override = cleanText(unit?.addressOverride);
  if (override) {
    return formatAddress(parseAddressText(override), { ...options, fallback: override });
  }

  return formatAddress(composeUnitAddress(property, unit), options);
}

export function getAddressSearchText(input?: AddressInput | StoredAddress | null) {
  return formatAddress(input, { fallback: "" }).toLowerCase();
}
