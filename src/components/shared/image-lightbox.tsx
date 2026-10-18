"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, open, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  // Jump to the tapped photo whenever the lightbox opens (adjusting state while rendering, not in an effect)
  const [shownFor, setShownFor] = useState({ open, initialIndex });
  if (shownFor.open !== open || shownFor.initialIndex !== initialIndex) {
    setShownFor({ open, initialIndex });
    if (open) setCurrentIndex(initialIndex);
  }

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      // RTL: ArrowRight = prev, ArrowLeft = next
      if (e.key === "ArrowRight") goPrev();
      if (e.key === "ArrowLeft") goNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, goNext, goPrev]);

  if (!open || images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 end-4 z-50 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        aria-label="إغلاق"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Counter badge */}
      {images.length > 1 && (
        <div className="absolute top-4 start-4 z-50 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Previous arrow (RTL: ChevronRight on right side) */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute right-3 z-50 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="السابق"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Next arrow (RTL: ChevronLeft on left side) */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute left-3 z-50 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="التالي"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const diff = touchStartX.current - e.changedTouches[0].clientX;
          touchStartX.current = null;
          // RTL: swipe left = next, swipe right = prev
          if (Math.abs(diff) > 50) {
            if (diff > 0) goNext();
            else goPrev();
          }
        }}
      >
        <Image
          src={images[currentIndex]}
          alt={`صورة ${currentIndex + 1}`}
          width={1600}
          height={1600}
          unoptimized
          loading="eager"
          className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg select-none"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
