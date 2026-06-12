import "server-only";

import path from "path";

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = "10 MB";

export const allowedUploadMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export const allowedUploadExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx"]);

const mimeTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

type UploadOwner = {
  id: string;
  organizationId: string;
};

type StoredAssetOptions = {
  allowDemo?: boolean;
};

export type PrivateAssetReference = {
  storage: "local" | "blob";
  storageKey: string;
};

const privateAssetPrefixes = {
  local: "private-local:",
  blob: "private-blob:"
} as const;

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-") || "upload";
}

export function getUploadExtension(fileName: string) {
  return path.extname(fileName).toLowerCase().replace(/^\./, "");
}

export function getUploadContentType(extension: string, mimeType?: string) {
  return mimeType && allowedUploadMimeTypes.has(mimeType) ? mimeType : mimeTypeByExtension[extension] ?? "application/octet-stream";
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "unknown";
}

export function getUploadStorageKey(fileName: string, owner: UploadOwner) {
  return [
    "uploads",
    safePathSegment(owner.organizationId),
    safePathSegment(owner.id),
    `${Date.now()}-${sanitizeFileName(fileName)}`
  ].join("/");
}

function startsWithBytes(bytes: Buffer, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasZipSignature(bytes: Buffer) {
  return (
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

function signatureMatchesExtension(bytes: Buffer, extension: string) {
  switch (extension) {
    case "jpg":
    case "jpeg":
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif":
      return bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a";
    case "webp":
      return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    case "pdf":
      return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    case "doc":
      return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "docx":
      return hasZipSignature(bytes);
    default:
      return false;
  }
}

export async function validateUploadFile(file: File) {
  const extension = getUploadExtension(file.name);
  const genericError = "Unsupported file type. Upload a JPG, JPEG, PNG, WEBP, GIF, PDF, DOC, or DOCX file.";

  if (!extension || !allowedUploadExtensions.has(extension)) {
    return { error: genericError };
  }

  if (file.type && !allowedUploadMimeTypes.has(file.type)) {
    return { error: genericError };
  }

  if (file.size <= 0) {
    return { error: "The selected file is empty." };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { error: `File is too large. Upload files up to ${MAX_UPLOAD_SIZE_LABEL}.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!signatureMatchesExtension(bytes, extension)) {
    return { error: genericError };
  }

  return {
    bytes,
    extension,
    contentType: getUploadContentType(extension, file.type)
  };
}

function stripQueryAndHash(value: string) {
  return value.split("?")[0]?.split("#")[0] ?? value;
}

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeLocalAssetPath(value: string) {
  const decoded = decodePath(stripQueryAndHash(value.trim()));
  if (!decoded || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  const absolute = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const normalized = path.posix.normalize(absolute);
  return normalized === absolute ? normalized : null;
}

function ownerUploadPrefix(owner?: UploadOwner) {
  if (!owner) return "/uploads/";
  return `/uploads/${safePathSegment(owner.organizationId)}/${safePathSegment(owner.id)}/`;
}

function ownerPrivateUploadPrefix(owner?: UploadOwner) {
  return ownerUploadPrefix(owner).replace(/^\//, "");
}

function normalizePrivateStorageKey(value: string) {
  const decoded = decodePath(value.trim());
  if (!decoded || decoded.startsWith("/") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  const normalized = path.posix.normalize(decoded);
  if (normalized !== decoded || !normalized.startsWith("uploads/")) return null;
  return normalized;
}

export function parsePrivateAssetReference(value: string): PrivateAssetReference | null {
  const trimmed = value.trim();
  const storage = trimmed.startsWith(privateAssetPrefixes.local)
    ? "local"
    : trimmed.startsWith(privateAssetPrefixes.blob)
      ? "blob"
      : null;
  if (!storage) return null;

  const storageKey = normalizePrivateStorageKey(trimmed.slice(privateAssetPrefixes[storage].length));
  return storageKey ? { storage, storageKey } : null;
}

function isAllowedPrivateAssetReference(value: string, owner?: UploadOwner) {
  const reference = parsePrivateAssetReference(value);
  return Boolean(reference && reference.storageKey.startsWith(ownerPrivateUploadPrefix(owner)));
}

function isAllowedLocalAssetPath(value: string, owner?: UploadOwner, options: StoredAssetOptions = {}) {
  const normalized = normalizeLocalAssetPath(value);
  if (!normalized) return false;
  if (normalized.startsWith(ownerUploadPrefix(owner))) return true;
  return Boolean(options.allowDemo && normalized.startsWith("/demo/"));
}

function isAllowedBlobUploadUrl(value: string, owner?: UploadOwner) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      isAllowedLocalAssetPath(url.pathname, owner)
    );
  } catch {
    return false;
  }
}

export function isAllowedSubmittedAssetPath(value: string, owner: UploadOwner) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  return isAllowedLocalAssetPath(trimmed, owner) || isAllowedBlobUploadUrl(trimmed, owner);
}

export function isAllowedTenantIdAssetPath(value: string, owner: UploadOwner) {
  if (!isAllowedSubmittedAssetPath(value, owner) && !isAllowedPrivateAssetReference(value, owner)) return false;
  try {
    const privateReference = parsePrivateAssetReference(value);
    const pathname = privateReference?.storageKey ?? (value.startsWith("http") ? new URL(value).pathname : stripQueryAndHash(value));
    return new Set(["jpg", "jpeg", "png", "pdf"]).has(getUploadExtension(pathname));
  } catch {
    return false;
  }
}

export function filterSubmittedAssetPaths(values: string[], owner: UploadOwner, max = values.length) {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!isAllowedSubmittedAssetPath(trimmed, owner)) continue;
    unique.add(trimmed);
    if (unique.size >= max) break;
  }
  return [...unique];
}

export function isAllowedStoredAssetPath(value?: string | null, options: StoredAssetOptions = {}) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  return (
    isAllowedLocalAssetPath(trimmed, undefined, options) ||
    isAllowedBlobUploadUrl(trimmed) ||
    isAllowedPrivateAssetReference(trimmed)
  );
}

export function isRemoteAssetUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
