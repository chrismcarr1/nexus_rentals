import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  const data = await request.formData();
  const file = data.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const outputDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);

  await writeFile(outputPath, buffer);

  return Response.json({
    path: `/uploads/${fileName}`,
    name: file.name
  });
}
