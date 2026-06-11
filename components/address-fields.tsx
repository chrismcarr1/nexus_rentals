"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_COUNTRY,
  MAILING_ADDRESS_FORM_FIELDS,
  STANDARD_ADDRESS_FORM_FIELDS,
  addressToFormValue,
  normalizeAddress,
  normalizeCountry,
  type AddressInput,
  type AddressFormFieldNames
} from "@/lib/address";

type AddressFieldsProps = {
  fieldNames?: AddressFormFieldNames;
  defaultValue?: AddressInput | null;
  required?: boolean;
  className?: string;
  inputClassName?: string;
};

type AddressState = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type AddressSuggestion = AddressState & {
  id: string;
  label: string;
};

type NominatimResult = {
  place_id?: number;
  osm_id?: number;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

function toAddressState(defaultValue?: AddressInput | null): AddressState {
  const address = addressToFormValue(defaultValue);

  return {
    addressLine1: address.addressLine1 ?? "",
    addressLine2: address.addressLine2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postalCode ?? "",
    country: normalizeCountry(address.country ?? DEFAULT_COUNTRY)
  };
}

function getStreetAddress(address: Record<string, string | undefined>) {
  const road =
    address.road ??
    address.pedestrian ??
    address.footway ??
    address.residential ??
    address.path ??
    address.cycleway ??
    address.neighbourhood ??
    "";

  return [address.house_number, road].filter(Boolean).join(" ").trim() || road;
}

function getCity(address: Record<string, string | undefined>) {
  return address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? address.county ?? "";
}

function toAddressSuggestion(result: NominatimResult): AddressSuggestion | null {
  const source = result.address ?? {};
  const addressLine1 = getStreetAddress(source);
  const city = getCity(source);
  const state = source.state_code ?? source.state ?? "";
  const postalCode = source.postcode ?? "";
  const country = normalizeCountry(source.country_code ?? source.country ?? DEFAULT_COUNTRY);

  if (!addressLine1 || !city || !state || !postalCode) return null;
  const normalized = normalizeAddress({ addressLine1, city, state, postalCode, country });

  return {
    id: String(result.place_id ?? result.osm_id ?? result.display_name ?? addressLine1),
    label: result.display_name ?? [addressLine1, city, state, postalCode].filter(Boolean).join(", "),
    addressLine1: normalized.addressLine1,
    addressLine2: "",
    city: normalized.city,
    state: normalized.state,
    postalCode: normalized.postalCode,
    country: normalized.country
  };
}

export function AddressFields({
  fieldNames = STANDARD_ADDRESS_FORM_FIELDS,
  defaultValue,
  required = true,
  className = "space-y-4",
  inputClassName = "field"
}: AddressFieldsProps) {
  const [address, setAddress] = useState<AddressState>(() => toAddressState(defaultValue));
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const selectedSuggestionRef = useRef("");

  useEffect(() => {
    setAddress(toAddressState(defaultValue));
  }, [defaultValue]);

  useEffect(() => {
    const query = address.addressLine1.trim();
    if (query.length < 4 || query === selectedSuggestionRef.current) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          addressdetails: "1",
          limit: "5",
          countrycodes: "us,ca",
          q: query
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: controller.signal,
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) throw new Error("Address lookup failed.");

        const payload = (await response.json()) as NominatimResult[];
        setSuggestions(payload.map(toAddressSuggestion).filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion)));
        setStatus("idle");
        setShowSuggestions(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setSuggestions([]);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [address.addressLine1]);

  function updateAddress(field: keyof AddressState, value: string) {
    if (field === "addressLine1") {
      selectedSuggestionRef.current = "";
    }

    setAddress((current) => ({
      ...current,
      [field]: field === "country" ? normalizeCountry(value) : value
    }));
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    selectedSuggestionRef.current = suggestion.addressLine1;
    setAddress(suggestion);
    setSuggestions([]);
    setShowSuggestions(false);
    setStatus("idle");
  }

  return (
    <div className={className}>
      <label className="block">
        <span className="field-label">Street address</span>
        <div className="relative">
          <input
            name={fieldNames.addressLine1}
            value={address.addressLine1}
            onChange={(event) => updateAddress("addressLine1", event.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
            required={required}
            minLength={required ? 3 : undefined}
            autoComplete="address-line1"
            placeholder="Street address"
            className={inputClassName}
          />
          {showSuggestions && suggestions.length ? (
            <div className="address-suggestions absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden border border-[var(--line)] bg-white">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                  className="address-suggestion block w-full px-3 py-2.5 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-hover)]"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {status === "error" ? <span className="mt-2 block text-xs text-red-700">Address lookup is unavailable right now.</span> : null}
        {status === "loading" ? <span className="mt-2 block text-xs text-[var(--muted)]">Searching addresses...</span> : null}
      </label>
      <label className="block">
        <span className="field-label">Apt, suite, or unit</span>
        <input
          name={fieldNames.addressLine2}
          value={address.addressLine2}
          onChange={(event) => updateAddress("addressLine2", event.target.value)}
          autoComplete="address-line2"
          placeholder="Apt, suite, or unit"
          className={inputClassName}
        />
      </label>
      <div className="form-grid-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">City</span>
          <input
            name={fieldNames.city}
            value={address.city}
            onChange={(event) => updateAddress("city", event.target.value)}
            required={required}
            minLength={required ? 2 : undefined}
            autoComplete="address-level2"
            placeholder="City"
            className={inputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">State or province</span>
          <input
            name={fieldNames.state}
            value={address.state}
            onChange={(event) => updateAddress("state", event.target.value)}
            required={required}
            autoComplete="address-level1"
            placeholder="State"
            className={inputClassName}
          />
        </label>
      </div>
      <div className="form-grid-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">ZIP or postal code</span>
          <input
            name={fieldNames.postalCode}
            value={address.postalCode}
            onChange={(event) => updateAddress("postalCode", event.target.value)}
            required={required}
            autoComplete="postal-code"
            placeholder="ZIP or postal code"
            className={inputClassName}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Country</span>
          <input
            name={fieldNames.country}
            value={address.country}
            onChange={(event) => updateAddress("country", event.target.value)}
            required={required}
            autoComplete="country-name"
            placeholder="Country"
            className={inputClassName}
          />
        </label>
      </div>
    </div>
  );
}

export { MAILING_ADDRESS_FORM_FIELDS, STANDARD_ADDRESS_FORM_FIELDS };
