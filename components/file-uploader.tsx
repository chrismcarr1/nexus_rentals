"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

type UploadedAsset = { path: string; name: string; skipped?: boolean };
type UploadResponse = UploadedAsset & { error?: string };

const defaultAcceptedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx"
].join(",");

export function FileUploader({
  label,
  accept = defaultAcceptedTypes,
  multiple = true,
  onChange
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  onChange: (assets: UploadedAsset[]) => void;
}) {
  const [items, setItems] = useState<UploadedAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    setIsUploading(true);
    setErrorMessage("");

    try {
      const uploaded: UploadedAsset[] = [];
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const response = await fetch("/api/upload", { method: "POST", body: formData });
          const payload = (await response.json().catch(() => ({}))) as UploadResponse;

          if (!response.ok) {
            errors.push(payload.error || `Could not upload ${file.name}.`);
            continue;
          }

          if (!payload.path) {
            errors.push(`Upload finished, but no file URL was returned for ${file.name}.`);
            continue;
          }

          uploaded.push({ path: payload.path, name: payload.name || file.name });
        } catch {
          errors.push(`Could not upload ${file.name}. Check your connection and try again.`);
        }
      }

      if (uploaded.length > 0) {
        const next = multiple ? [...items, ...uploaded] : uploaded.slice(0, 1);
        setItems(next);
        onChange(next);
      }

      if (errors.length > 0) {
        setErrorMessage([...new Set(errors)].join(" "));
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-4">
      <label className="mb-3 flex cursor-pointer flex-col gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2">
          <Upload className="h-4 w-4" />
          {label}
        </span>
        <span>{isUploading ? "Uploading..." : multiple ? "Choose files" : "Choose file"}</span>
        <input
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          disabled={isUploading}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <div className="space-y-2">
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" aria-live="polite">
            {errorMessage}
          </p>
        ) : null}
        {items.length === 0 ? <p className="text-sm text-stone-500">No files uploaded yet.</p> : null}
        {items.map((item) => (
          <div key={item.path} className="flex items-center justify-between rounded-2xl bg-stone-900/5 px-3 py-2 text-sm">
            <span className="truncate">{item.name}</span>
            <button
              type="button"
              className="rounded-full p-1 text-stone-500 hover:bg-white"
              onClick={() => {
                const next = items.filter((candidate) => candidate.path !== item.path);
                setItems(next);
                onChange(next);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
