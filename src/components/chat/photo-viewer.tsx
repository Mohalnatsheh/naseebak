"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChatMedia } from "@/lib/chat/service";
import { clampPan, clampZoom, photoSwipe } from "./photo-viewer-logic";

export interface ViewerPhoto {
  id: string;
  media: ChatMedia;
  /** The time line under the photo («أنت» / name · time) */
  caption: string;
}

const DOUBLE_TAP_ZOOM = 2.5;

type Gesture =
  | { kind: "swipe"; id: number; x: number; y: number; dx: number }
  | { kind: "pan"; id: number; x: number; y: number; ox: number; oy: number }
  | { kind: "pinch"; dist: number; scale: number };

/**
 * The chat's photos full screen, on black: pinch / wheel / double-tap zoom (1×–4×), drag to move a zoomed photo,
 * swipe (or the arrows, or the arrow keys) between the chat's photos. No download button. A `Dialog`, so focus, Esc
 * and the back gesture behave; ✕ at the top end.
 */
export function PhotoViewer({
  photos,
  openId,
  onClose,
}: {
  photos: ViewerPhoto[];
  openId: string | null;
  onClose: () => void;
}) {
  const open = !!openId && photos.some((p) => p.id === openId);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        dir="rtl"
        className="top-0 left-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white shadow-none sm:max-w-none"
      >
        {open && <ViewerBody key={openId} photos={photos} startId={openId} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ photos, startId }: { photos: ViewerPhoto[]; startId: string }) {
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((p) => p.id === startId)));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragX, setDragX] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);
  const photo = photos[Math.min(index, photos.length - 1)];
  const count = photos.length;

  function go(next: number) {
    const i = Math.min(count - 1, Math.max(0, next));
    if (i === index) return;
    setIndex(i);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  const stage = useRef<HTMLDivElement>(null);
  /** The pan kept on the photo at this zoom (it can't be dragged off screen) */
  const keepOnPhoto = (o: { x: number; y: number }, s: number) =>
    clampPan(o, s, { width: stage.current?.clientWidth ?? 0, height: stage.current?.clientHeight ?? 0 });

  function zoomTo(next: number) {
    const s = clampZoom(next);
    setScale(s);
    setOffset((o) => keepOnPhoto(o, s));
  }

  // The viewer is laid out right-to-left (dir on the dialog); a page in LTR flips the swipe and the arrow keys
  const rtl = () => (stage.current?.closest("[dir]")?.getAttribute("dir") ?? "rtl") === "rtl";

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale };
      setDragX(0);
      return;
    }
    // Double tap / double click: zoom in at once, or back to the whole photo
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      zoomTo(scale > 1 ? 1 : DOUBLE_TAP_ZOOM);
      gesture.current = null;
      return;
    }
    lastTap.current = now;
    gesture.current =
      scale > 1
        ? { kind: "pan", id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
        : { kind: "swipe", id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0 };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      zoomTo((g.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist);
    } else if (g.kind === "pan" && e.pointerId === g.id) {
      setOffset(keepOnPhoto({ x: g.ox + (e.clientX - g.x) / scale, y: g.oy + (e.clientY - g.y) / scale }, scale));
    } else if (g.kind === "swipe" && e.pointerId === g.id) {
      g.dx = e.clientX - g.x;
      setDragX(g.dx);
    }
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "swipe" && e.pointerId === g.id) {
      go(photoSwipe({ index, count, dx: g.dx, rtl: rtl() }));
      gesture.current = null;
    } else if (g?.kind === "pinch" && pointers.current.size < 2) {
      gesture.current = null;
    } else if (g?.kind === "pan" && e.pointerId === g.id) {
      gesture.current = null;
    }
    setDragX(0);
  }

  if (!photo) return null;
  const local = photo.media.url.startsWith("blob:");
  const imgClass = "max-h-full max-w-full select-none object-contain";

  return (
    <div
      className="flex h-full w-full flex-col"
      onKeyDown={(e) => {
        // Arrows follow the screen: in RTL the newer photo is to the left
        if (e.key === "ArrowLeft") go(index + (rtl() ? 1 : -1));
        else if (e.key === "ArrowRight") go(index + (rtl() ? -1 : 1));
        else if (e.key === "+" || e.key === "=") zoomTo(scale * 1.5);
        else if (e.key === "-") zoomTo(scale / 1.5);
      }}
    >
      <div className="flex items-center gap-2 bg-black/60 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0 flex-1 ps-2">
          <DialogTitle className="truncate text-sm font-semibold text-white">{photo.caption}</DialogTitle>
          <DialogDescription className="text-xs text-white/70">
            {count > 1 ? `${index + 1} من ${count}` : "صورة"}
          </DialogDescription>
        </div>
        <button
          type="button"
          onClick={() => zoomTo(scale > 1 ? 1 : DOUBLE_TAP_ZOOM)}
          aria-label={scale > 1 ? "تصغير" : "تكبير"}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
        >
          {scale > 1 ? <ZoomOut className="h-5 w-5" aria-hidden /> : <ZoomIn className="h-5 w-5" aria-hidden />}
        </button>
        {/* ✕ at the top end, like every dialog (end-2) */}
        <DialogClose
          aria-label="إغلاق"
          className="absolute top-[max(0.5rem,env(safe-area-inset-top))] end-2 flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
        >
          <X className="h-6 w-6" aria-hidden />
        </DialogClose>
        <span className="w-11 shrink-0" aria-hidden />
      </div>

      <div
        ref={stage}
        data-testid="photo-stage"
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={(e) => zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className={cn("flex h-full w-full items-center justify-center", !dragX && "transition-transform duration-200")}
          style={{ transform: `translateX(${dragX}px) scale(${scale}) translate(${offset.x}px, ${offset.y}px)` }}
        >
          {local ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: preview of a photo still uploading
            <img src={photo.media.url} alt="صورة" draggable={false} className={imgClass} />
          ) : (
            <Image
              src={photo.media.url}
              alt="صورة"
              width={photo.media.width ?? 1200}
              height={photo.media.height ?? 1200}
              unoptimized
              draggable={false}
              className={cn(imgClass, "h-auto w-auto")}
            />
          )}
        </div>
        {count > 1 && (
          <>
            {/* RTL: ChevronRight = السابق (older) on the right, ChevronLeft = التالي (newer) on the left */}
            <button
              type="button"
              onClick={() => go(index - 1)}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={index === 0}
              aria-label="الصورة السابقة"
              className="absolute start-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-0"
            >
              <ChevronRight className="h-6 w-6 ltr:rotate-180" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={index === count - 1}
              aria-label="الصورة التالية"
              className="absolute end-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-0"
            >
              <ChevronLeft className="h-6 w-6 ltr:rotate-180" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
