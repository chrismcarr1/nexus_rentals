"use client";

import { useState, useTransition } from "react";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type UploadedAsset = { path: string; name: string };

export function FileUploader({
  label,
  multiple = true,
  onChange
}: {
  label: string;
  multiple?: boolean;
  onChange: (assets: UploadedAsset[]) => void;
}) {
  const [items, setItems] = useState<UploadedAsset[]>([]);
  const [isPending, startTransition] = useTransition();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    startTransition(async () => {
      const uploaded: UploadedAsset[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        if (!response.ok) continue;
        const payload = (await response.json()) as UploadedAsset;
        uploaded.push(payload);
      }

      const next = multiple ? [...items, ...uploaded] : uploaded.slice(0, 1);
      setItems(next);
      onChange(next);
    });
  }

  return (
    <div className="rounded-[24px] border border-dashed border-[var(--line)] bg-white/50 p-4">
      <label className="mb-3 flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--muted)]">
        <span className="inline-flex items-center gap-2">
          <Upload className="h-4 w-4" />
          {label}
        </span>
        <span>{isPending ? "Uploading..." : "Choose files"}</span>
        <input type="file" className="hidden" accept="image/*,.pdf" multiple={multiple} onChange={(e) => handleFiles(e.target.files)} />
      </label>
      <div className="space-y-2">
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
