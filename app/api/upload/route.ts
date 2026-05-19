import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const localUploadDir = path.join(process.cwd(), "public", "uploads");

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
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
  const data = await request.formData();
  const file = data.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const localPath = await saveLocalUpload(file);

    return Response.json({
      path: localPath,
      name: file.name
    });
  }

  try {
    const fileName = `uploads/${Date.now()}-${sanitizeFileName(file.name)}`;
    const blob = await put(fileName, file, {
      access: "public",
      addRandomSuffix: true
    });

    return Response.json({
      path: blob.url,
      name: file.name
    });
  } catch (error) {
    console.error("[upload] Failed to persist file to Vercel Blob", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
