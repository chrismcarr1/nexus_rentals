"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Photo = { id: string; path: string; label?: string | null };

export function PhotoCarousel({ photos, height = "h-72" }: { photos: Photo[]; height?: string }) {
  const [index, setIndex] = useState(0);
  if (!photos.length) return null;
  const photo = photos[index];
  const multi = photos.length > 1;
  return (
    <div className={`relative overflow-hidden bg-black ${height}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.path} alt={photo.label ?? "Photo"} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      {multi && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % photos.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-medium text-white">
            {index + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}
