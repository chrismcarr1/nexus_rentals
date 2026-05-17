import { put } from "@vercel/blob";

export async function POST(request: Request) {
  const data = await request.formData();
  const file = data.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[upload] BLOB_READ_WRITE_TOKEN is not configured. Skipping optional file upload.");
    return Response.json({
      path: "",
      name: file.name,
      skipped: true
    });
  }

  try {
    const fileName = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
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
