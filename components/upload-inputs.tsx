"use client";

import { useState } from "react";

import { FileUploader } from "@/components/file-uploader";

export function SingleUploadInput({
  name,
  label,
  accept,
  purpose
}: {
  name: string;
  label: string;
  accept?: string;
  purpose?: "tenant-id";
}) {
  const [path, setPath] = useState("");

  return (
    <div className="space-y-3">
      <FileUploader
        label={label}
        accept={accept}
        multiple={false}
        purpose={purpose}
        onChange={(items) => {
          setPath(items[0]?.path ?? "");
        }}
      />
      <input type="hidden" name={name} value={path} />
    </div>
  );
}

export function MultiUploadInput({ name, label, accept }: { name: string; label: string; accept?: string }) {
  const [paths, setPaths] = useState<string[]>([]);

  return (
    <div className="space-y-3">
      <FileUploader
        label={label}
        accept={accept}
        onChange={(items) => {
          setPaths(items.map((item) => item.path));
        }}
      />
      {paths.map((path) => (
        <input key={path} type="hidden" name={name} value={path} />
      ))}
    </div>
  );
}
