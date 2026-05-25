import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_SIZE_LABEL = "10 MB";
const localUploadDir = path.join(process.cwd(), "public", "uploads");
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx"]);
const fallbackMimeTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-") || "upload";
}

function getExtension(fileName: string) {
  return path.extname(fileName).toLowerCase().replace(/^\./, "");
}

function validateUpload(file: File) {
  const extension = getExtension(file.name);

  if (!extension || !allowedExtensions.has(extension)) {
    return `Unsupported file type. Upload a JPG, JPEG, PNG, WEBP, GIF, PDF, DOC, or DOCX file.`;
  }

  if (file.type && !allowedMimeTypes.has(file.type)) {
    return `Unsupported file type. Upload a JPG, JPEG, PNG, WEBP, GIF, PDF, DOC, or DOCX file.`;
  }

  if (file.size <= 0) {
    return "The selected file is empty.";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `File is too large. Upload files up to ${MAX_UPLOAD_SIZE_LABEL}.`;
  }

  return null;
}

async function saveLocalUpload(file: File) {
  await mkdir(localUploadDir, { recursive: true });
  const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const uploadPath = path.join(localUploadDir, fileName);
  const bytes = await file.arrayBuffer();

  await writeFile(uploadPath, Buffer.from(bytes));

  return `/uploads/${fileName}`;
}

export async function POST(request: Request) {
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

  const validationError = validateUpload(file);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

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
      const localPath = await saveLocalUpload(file);

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
    const extension = getExtension(file.name);
    const fileName = `uploads/${Date.now()}-${sanitizeFileName(file.name)}`;
    const blob = await put(fileName, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || fallbackMimeTypeByExtension[extension]
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
