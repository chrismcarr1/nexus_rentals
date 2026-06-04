import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { getCurrentUser } from "@/lib/auth";
import { getUploadStorageKey, validateUploadFile } from "@/lib/file-security";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const localUploadDir = path.join(process.cwd(), "public", "uploads");

async function saveLocalUpload(storageKey: string, bytes: Buffer) {
  const uploadPath = path.join(process.cwd(), "public", storageKey);

  if (!uploadPath.startsWith(localUploadDir + path.sep)) {
    throw new Error("Invalid upload path.");
  }

  await mkdir(path.dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, bytes);
  return `/${storageKey.replace(/\\/g, "/")}`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in before uploading files." }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `upload:${user.id}`,
    limit: 30,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  let data: FormData;

  try {
    data = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const file = data.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const validation = await validateUploadFile(file);
  if (validation.error || !validation.bytes || !validation.contentType) {
    return Response.json({ error: validation.error ?? "Invalid upload." }, { status: 400 });
  }

  const storageKey = getUploadStorageKey(file.name, user);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Vercel production functions cannot persist uploads to the local filesystem.
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        {
          error: "Upload storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel production environment variables."
        },
        { status: 500 }
      );
    }

    try {
      const localPath = await saveLocalUpload(storageKey, validation.bytes);

      return Response.json({
        path: localPath,
        url: localPath,
        name: file.name
      });
    } catch (error) {
      console.error("[upload] Failed to persist local upload", error);
      return Response.json({ error: "Upload failed while saving the local development file." }, { status: 500 });
    }
  }

  try {
    const blob = await put(storageKey, new Blob([validation.bytes], { type: validation.contentType }), {
      access: "public",
      addRandomSuffix: true,
      contentType: validation.contentType
    });

    return Response.json({
      path: blob.url,
      url: blob.url,
      name: file.name
    });
  } catch (error) {
    console.error("[upload] Failed to persist file to Vercel Blob", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
