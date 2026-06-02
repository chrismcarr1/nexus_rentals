"use client";

import { useMemo, useState } from "react";
import { FileImage, Sparkles, Upload, X } from "lucide-react";

import { createMaintenanceAction } from "@/lib/actions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

type UploadedPhoto = { path: string; name: string };
type PropertyOption = { id: string; name: string };
type UnitOption = { id: string; propertyId: string; unitNumber: string; propertyName: string };
type DraftResponse = {
  draft?: {
    category: string;
    title: string;
    description: string;
    estimatedLow: number;
    estimatedHigh: number;
    estimatedCost: number;
    accessNotes: string;
    timeline: string;
    confidenceScore: number;
    explanation: string;
  };
  error?: string;
};

const imageAccept = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

function emptyDraftFields(userName: string) {
  return {
    category: "",
    title: "",
    description: "",
    estimatedCost: "",
    entryPermission: "REQUEST_APPROVAL",
    contactPreference: "APP",
    contactName: userName,
    contactPhone: "",
    preferredWindow: "",
    accessNotes: "",
    petsOnSite: "UNKNOWN",
    timeline: ""
  };
}

export function MaintenanceAiRequestForm({
  userRole,
  userName,
  properties,
  units,
  currentProperty,
  currentUnit
}: {
  userRole: string;
  userName: string;
  properties: PropertyOption[];
  units: UnitOption[];
  currentProperty?: PropertyOption | null;
  currentUnit?: UnitOption | null;
}) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftSummary, setDraftSummary] = useState<DraftResponse["draft"] | null>(null);
  const [propertyId, setPropertyId] = useState(currentProperty?.id ?? "");
  const [unitId, setUnitId] = useState(currentUnit?.id ?? "");
  const [fields, setFields] = useState(() => emptyDraftFields(userName));

  const filteredUnits = useMemo(
    () => (propertyId ? units.filter((unit) => unit.propertyId === propertyId) : []),
    [propertyId, units]
  );
  const selectedUnit = units.find((unit) => unit.id === unitId);
  const unitLabel = selectedUnit
    ? `${selectedUnit.propertyName} Unit ${selectedUnit.unitNumber}`
    : currentUnit
      ? `${currentUnit.propertyName} Unit ${currentUnit.unitNumber}`
      : currentProperty?.name ?? "";

  function updateField(name: keyof ReturnType<typeof emptyDraftFields>, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;

    const remainingSlots = Math.max(0, 3 - photos.length);
    const selected = Array.from(files).slice(0, remainingSlots);
    if (selected.length === 0) {
      setUploadError("Remove a photo before adding another. AI requests support up to 3 photos.");
      return;
    }

    setIsUploading(true);
    setUploadError("");

    try {
      const uploaded: UploadedPhoto[] = [];
      const errors: string[] = [];

      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        const payload = (await response.json().catch(() => ({}))) as { path?: string; name?: string; error?: string };

        if (!response.ok || !payload.path) {
          errors.push(payload.error || `Could not upload ${file.name}.`);
          continue;
        }

        uploaded.push({ path: payload.path, name: payload.name || file.name });
      }

      setPhotos((current) => [...current, ...uploaded].slice(0, 3));
      if (errors.length) setUploadError([...new Set(errors)].join(" "));
      if (Array.from(files).length > selected.length) {
        setUploadError("Only the first 3 photos were kept for this AI request.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function generateDraft() {
    if (photos.length === 0) {
      setDraftError("Upload at least one photo first.");
      return;
    }

    setIsGenerating(true);
    setDraftError("");

    try {
      const response = await fetch("/api/maintenance/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePaths: photos.map((photo) => photo.path),
          notes: fields.description || fields.title
        })
      });
      const payload = (await response.json().catch(() => ({}))) as DraftResponse;

      if (!response.ok || !payload.draft) {
        setDraftError(payload.error || "Could not generate an AI maintenance draft.");
        return;
      }

      setDraftSummary(payload.draft);
      setFields((current) => ({
        ...current,
        category: payload.draft!.category,
        title: payload.draft!.title,
        description: payload.draft!.description,
        estimatedCost: String(payload.draft!.estimatedCost),
        accessNotes: payload.draft!.accessNotes,
        timeline: payload.draft!.timeline
      }));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <form action={createMaintenanceAction} className="mt-5 space-y-5">
      <input type="hidden" name="status" value="OPEN" />
      <input type="hidden" name="priority" value="MEDIUM" />
      <input type="hidden" name="actualCost" value="" />
      <input type="hidden" name="assignedTo" value="" />
      {photos.map((photo) => (
        <input key={photo.path} type="hidden" name="imagePaths" value={photo.path} />
      ))}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Photos</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{photos.length}/3 uploaded</p>
            </div>
            <FileImage className="h-5 w-5 text-[var(--brand)]" />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--text)]">
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {isUploading ? "Uploading..." : "Add photos"}
            </span>
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Max 3</span>
            <input
              type="file"
              accept={imageAccept}
              multiple
              disabled={isUploading || photos.length >= 3}
              className="hidden"
              onChange={(event) => {
                void uploadPhotos(event.target.files);
                event.target.value = "";
              }}
            />
          </label>

          {uploadError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p> : null}
          {draftError ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{draftError}</p> : null}

          <div className="grid gap-3">
            {photos.length ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Uploaded images</p> : null}
            {photos.map((photo) => (
              <div key={photo.path} className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-white px-3 py-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--brand)]">
                  <FileImage className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{photo.name}</p>
                  <p className="text-xs text-[var(--muted)]">Attached to request</p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  onClick={() => setPhotos((current) => current.filter((item) => item.path !== photo.path))}
                  aria-label={`Remove ${photo.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {photos.length === 0 ? <p className="text-sm text-[var(--muted)]">Upload a close-up, a wide room view, and any important visible detail.</p> : null}
          </div>

          <Button type="button" className="w-full" onClick={generateDraft} disabled={photos.length === 0 || isGenerating || isUploading}>
            <Sparkles className="h-4 w-4" />
            {isGenerating ? "Generating draft..." : "Generate AI draft"}
          </Button>
        </section>

        <section className="space-y-4">
          {draftSummary ? (
            <div className="rounded-md border border-[rgba(13,143,123,0.2)] bg-[var(--accent-soft)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{draftSummary.category}</Badge>
                <span className="text-sm font-semibold text-[var(--text)]">
                  ${draftSummary.estimatedLow.toLocaleString()} - ${draftSummary.estimatedHigh.toLocaleString()}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">{draftSummary.explanation}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Confidence {Math.round(draftSummary.confidenceScore * 100)}%
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {userRole === "TENANT" ? (
              <>
                <input type="hidden" name="propertyId" value={currentProperty?.id ?? ""} />
                <input type="hidden" name="unitId" value={currentUnit?.id ?? ""} />
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Unit</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text)]">{unitLabel || "Assigned unit"}</p>
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="text-sm font-semibold text-[var(--text)]">Property</span>
                  <select
                    name="propertyId"
                    className="field mt-2"
                    value={propertyId}
                    onChange={(event) => {
                      setPropertyId(event.target.value);
                      setUnitId("");
                    }}
                    required
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[var(--text)]">Unit</span>
                  <select name="unitId" className="field mt-2" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                    <option value="">No specific unit</option>
                    {filteredUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.propertyName} - Unit {unit.unitNumber}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="block">
              <span className="text-sm font-semibold text-[var(--text)]">Category</span>
              <input name="category" value={fields.category} onChange={(event) => updateField("category", event.target.value)} className="field mt-2" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--text)]">Estimated cost</span>
              <input name="estimatedCost" type="number" min="0" step="1" value={fields.estimatedCost} onChange={(event) => updateField("estimatedCost", event.target.value)} className="field mt-2" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--text)]">Issue title</span>
              <input name="title" required minLength={2} value={fields.title} onChange={(event) => updateField("title", event.target.value)} className="field mt-2" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-[var(--text)]">AI-filled description</span>
              <textarea name="description" required minLength={4} value={fields.description} onChange={(event) => updateField("description", event.target.value)} className="field mt-2 min-h-24" />
            </label>
            <input type="hidden" name="entryPermission" value={fields.entryPermission} />
            <input type="hidden" name="contactPreference" value={fields.contactPreference} />
            <input type="hidden" name="contactName" value={fields.contactName} />
            <input type="hidden" name="contactPhone" value={fields.contactPhone} />
            <input type="hidden" name="preferredWindow" value={fields.preferredWindow} />
            <input type="hidden" name="petsOnSite" value={fields.petsOnSite} />
            <input type="hidden" name="accessNotes" value={fields.accessNotes} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-[var(--text)]">AI timeline and cost note</span>
              <textarea name="timeline" value={fields.timeline} onChange={(event) => updateField("timeline", event.target.value)} className="field mt-2 min-h-24" />
            </label>
          </div>
        </section>
      </div>

      <SubmitButton className="w-full" pendingLabel="Submitting request...">
        Submit AI maintenance request
      </SubmitButton>
    </form>
  );
}
