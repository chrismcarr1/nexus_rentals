export const PROPERTY_PHOTO_LIMIT = 20;
export const UNIT_PHOTO_LIMIT = 10;

export type DocumentKind =
  | "PROPERTY_IMAGE"
  | "UNIT_IMAGE"
  | "MOVE_IN_IMAGE"
  | "MOVE_OUT_IMAGE"
  | "DAMAGE_IMAGE"
  | "MAINTENANCE_IMAGE"
  | "TENANT_ID"
  | "LEASE_DOCUMENT"
  | "LEASE_ATTACHMENT"
  | "PAYMENT_DOCUMENT"
  | "GENERAL_DOCUMENT"
  | "AVATAR";

type FileMetadata = {
  kind?: string | null;
  displayName?: string | null;
  label?: string | null;
  originalFileName?: string | null;
  path?: string | null;
};

export function cleanDisplayName(value: string | undefined | null, fallback: string) {
  const cleaned = value?.replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || fallback;
}

export function defaultPhotoName(kind: "property" | "unit", index: number) {
  return `${kind === "property" ? "Property" : "Unit"} photo ${index}`;
}

export function fileNameFromPath(value: string | undefined | null) {
  if (!value) return "";
  try {
    const pathname = value.startsWith("http") ? new URL(value).pathname : value.split(/[?#]/)[0] ?? value;
    const raw = pathname.split("/").filter(Boolean).at(-1) ?? "";
    const decoded = decodeURIComponent(raw);
    return decoded.replace(/^\d{10,}-/, "").replace(/-[a-z0-9]{8,}(?=\.[^.]+$)/i, "");
  } catch {
    return "";
  }
}

export function getFileDisplayName(file: FileMetadata, fallback = "General document") {
  return cleanDisplayName(
    file.displayName || file.label || file.originalFileName || fileNameFromPath(file.path),
    fallback
  );
}

export function documentTypeLabel(kind: string | undefined | null) {
  switch (kind) {
    case "PROPERTY_IMAGE":
      return "Property image";
    case "UNIT_IMAGE":
      return "Unit image";
    case "TENANT_ID":
      return "Tenant ID";
    case "LEASE_DOCUMENT":
      return "Lease";
    case "LEASE_ATTACHMENT":
      return "Lease attachment";
    case "MOVE_IN_IMAGE":
      return "Move-in photo";
    case "MOVE_OUT_IMAGE":
      return "Move-out photo";
    case "DAMAGE_IMAGE":
      return "Damage photo";
    case "MAINTENANCE_IMAGE":
      return "Maintenance photo";
    case "PAYMENT_DOCUMENT":
      return "Payment document";
    case "AVATAR":
      return "Profile image";
    case "GENERAL_DOCUMENT":
      return "General document";
    default:
      return "General document";
  }
}

export function documentFilterGroup(kind: string | undefined | null) {
  switch (kind) {
    case "PROPERTY_IMAGE":
      return "property-images";
    case "UNIT_IMAGE":
      return "unit-images";
    case "TENANT_ID":
      return "ids";
    case "LEASE_DOCUMENT":
    case "LEASE_ATTACHMENT":
      return "leases";
    case "MOVE_IN_IMAGE":
    case "MOVE_OUT_IMAGE":
    case "DAMAGE_IMAGE":
    case "MAINTENANCE_IMAGE":
      return "maintenance";
    default:
      return "general";
  }
}

export function photoLimitExceeded(existingCount: number, incomingCount: number, limit: number) {
  return existingCount + incomingCount > limit;
}

export function documentDownloadHref(fileId: string) {
  return `/api/documents/${encodeURIComponent(fileId)}`;
}
