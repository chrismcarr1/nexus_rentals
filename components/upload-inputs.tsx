"use client";

import { useState } from "react";

import { FileUploader } from "@/components/file-uploader";

export function SingleUploadInput({ name, label }: { name: string; label: string }) {
  const [path, setPath] = useState("");

  return (
    <div className="space-y-3">
      <FileUploader
        label={label}
        multiple={false}
        onChange={(items) => {
          setPath(items[0]?.path ?? "");
        }}
      />
      <input type="hidden" name={name} value={path} />
    </div>
  );
}

export function MultiUploadInput({ name, label }: { name: string; label: string }) {
  const [paths, setPaths] = useState<string[]>([]);

  return (
    <div className="space-y-3">
      <FileUploader
        label={label}
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
