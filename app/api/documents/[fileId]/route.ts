import { get as getBlob } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getCurrentUser } from "@/lib/auth";
import { getFileDisplayName } from "@/lib/document-metadata";
import {
  getUploadContentType,
  getUploadExtension,
  isAllowedStoredAssetPath,
  parsePrivateAssetReference,
  sanitizeFileName
} from "@/lib/file-security";
import { requiresLegalAcceptance } from "@/lib/legal";
import { getPortalContext } from "@/services/portal";

export const runtime = "nodejs";

const localPrivateUploadDir = path.join(process.cwd(), "data", "private-uploads");

function downloadHeaders(fileName: string, contentType: string, contentLength?: number) {
  const safeName = sanitizeFileName(fileName);
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff"
  });
  if (contentLength !== undefined) headers.set("Content-Length", String(contentLength));
  return headers;
}

function localPrivatePath(storageKey: string) {
  const filePath = path.resolve(localPrivateUploadDir, storageKey.replace(/\//g, path.sep));
  return filePath.startsWith(localPrivateUploadDir + path.sep) ? filePath : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (requiresLegalAcceptance(user)) {
    return Response.json({ error: "Complete account setup before opening documents." }, { status: 403 });
  }

  const { fileId } = await params;
  const portal = await getPortalContext(user);
  const file = portal.scope.files.find((candidate) => candidate.id === fileId);
  if (!file || !isAllowedStoredAssetPath(file.path, { allowDemo: true })) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const privateReference = parsePrivateAssetReference(file.path);
  const fileName = getFileDisplayName(file, "document");

  if (privateReference?.storage === "local") {
    const filePath = localPrivatePath(privateReference.storageKey);
    if (!filePath) return Response.json({ error: "Document not found." }, { status: 404 });

    try {
      const bytes = await readFile(filePath);
      const contentType = file.mimeType || getUploadContentType(getUploadExtension(privateReference.storageKey));
      return new Response(bytes, { headers: downloadHeaders(fileName, contentType, bytes.byteLength) });
    } catch (error) {
      console.error("[documents] Failed to read private local file", error);
      return Response.json({ error: "Document not found." }, { status: 404 });
    }
  }

  if (privateReference?.storage === "blob") {
    try {
      const result = await getBlob(privateReference.storageKey, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200) {
        return Response.json({ error: "Document not found." }, { status: 404 });
      }
      return new Response(result.stream, {
        headers: downloadHeaders(fileName, result.blob.contentType, result.blob.size)
      });
    } catch (error) {
      console.error("[documents] Failed to read private blob", error);
      return Response.json({ error: "Document could not be opened." }, { status: 502 });
    }
  }

  const location = new URL(file.path, request.url).toString();
  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Location: location,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
