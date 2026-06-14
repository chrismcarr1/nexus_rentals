"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getPhotoSwipeDirection } from "@/lib/photo-gallery";

type Photo = { id: string; path: string; label?: string | null; displayName?: string | null };
type Point = { x: number; y: number };

export function PhotoCarousel({
  photos,
  height = "h-72",
  label = "Photo gallery"
}: {
  photos: Photo[];
  height?: string;
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<Point | null>(null);

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(photos.length - 1, 0)));
  }, [photos.length]);

  if (!photos.length) return null;
  const visibleIndex = Math.min(index, photos.length - 1);
  const photo = photos[visibleIndex];
  const multi = photos.length > 1;

  function showPrevious() {
    setIndex((current) => (current - 1 + photos.length) % photos.length);
  }

  function showNext() {
    setIndex((current) => (current + 1) % photos.length);
  }

  function finishSwipe(point: Point) {
    if (!swipeStart.current || !multi) return;
    const direction = getPhotoSwipeDirection(swipeStart.current, point);
    swipeStart.current = null;
    if (direction === 1) showNext();
    if (direction === -1) showPrevious();
  }

  return (
    <div
      className="photo-carousel bg-black"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={(event) => {
        if (!multi) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          showPrevious();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          showNext();
        }
      }}
    >
      <div
        className={`relative overflow-hidden bg-black outline-none ${height}`}
        tabIndex={multi ? 0 : -1}
        style={{ touchAction: "pan-y" }}
        onPointerDown={(event) => {
          if (!multi) return;
          swipeStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          finishSwipe({ x: event.clientX, y: event.clientY });
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={photo.path}
          alt={photo.displayName ?? photo.label ?? `Photo ${visibleIndex + 1}`}
          className="h-full w-full select-none object-cover"
          loading={visibleIndex === 0 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
        <span className="absolute bottom-2 left-3 max-w-[70%] truncate rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
          {photo.displayName ?? photo.label ?? `Photo ${visibleIndex + 1}`}
        </span>
        {multi ? (
          <>
          <button
            type="button"
            onClick={showPrevious}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={showNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-medium text-white">
            {visibleIndex + 1} / {photos.length}
          </span>
          </>
        ) : null}
      </div>

      {multi ? (
        <div className="flex gap-2 overflow-x-auto bg-[var(--panel)] p-2" aria-label="Choose a photo">
          {photos.map((candidate, candidateIndex) => {
            const selected = candidateIndex === visibleIndex;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setIndex(candidateIndex)}
                className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 bg-black transition ${
                  selected
                    ? "border-[var(--brand)] ring-2 ring-[color-mix(in_srgb,var(--brand)_20%,transparent)]"
                    : "border-transparent opacity-75 hover:opacity-100"
                }`}
                aria-label={`Show photo ${candidateIndex + 1} of ${photos.length}`}
                aria-current={selected ? "true" : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.path}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {candidateIndex + 1}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
