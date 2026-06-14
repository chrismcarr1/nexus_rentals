"use client";

import { useState } from "react";

import { FileUploader, type UploadedAsset } from "@/components/file-uploader";
import { defaultPhotoName } from "@/lib/document-metadata";

export function NamedPhotoUpload({
  pathName,
  titleName,
  originalNameName,
  kind,
  existingCount,
  limit,
  label
}: {
  pathName: string;
  titleName: string;
  originalNameName: string;
  kind: "property" | "unit";
  existingCount: number;
  limit: number;
  label: string;
}) {
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});

  function updateAssets(next: UploadedAsset[]) {
    setAssets(next);
    setTitles((current) => {
      const nextTitles: Record<string, string> = {};
      next.forEach((asset, index) => {
        nextTitles[asset.path] =
          current[asset.path] || defaultPhotoName(kind, existingCount + index + 1);
      });
      return nextTitles;
    });
  }

  return (
    <div className="space-y-3">
      <FileUploader
        label={label}
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        maxItems={limit}
        existingCount={existingCount}
        onChange={updateAssets}
      />
      {assets.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {assets.map((asset, index) => (
            <div key={asset.path} className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.path} alt="" className="h-14 w-16 rounded-md object-cover" />
                <label className="min-w-0 flex-1">
                  <span className="field-label">Photo name</span>
                  <input
                    className="field"
                    maxLength={120}
                    value={titles[asset.path] ?? defaultPhotoName(kind, existingCount + index + 1)}
                    onChange={(event) =>
                      setTitles((current) => ({ ...current, [asset.path]: event.target.value }))
                    }
                  />
                </label>
              </div>
              <input type="hidden" name={pathName} value={asset.path} />
              <input
                type="hidden"
                name={titleName}
                value={titles[asset.path] ?? defaultPhotoName(kind, existingCount + index + 1)}
              />
              <input type="hidden" name={originalNameName} value={asset.name} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
