"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { SheetTitle } from "@/components/ui/sheet";
import { DetailSheet } from "@/components/shared/detail-sheet";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import type { MatchSummary } from "@/components/matches/match-types";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { forPartner } from "@/lib/gendered-copy";

/**
 * The whole profile of a matched person in one scroll: the revealed photos (only while the match is open and the
 * photos are revealed) and every detail. Same panel shell as the suggestions' `ProfileSheet`.
 */
export function MatchProfileSheet({
  match,
  photos,
  photosFailed,
  onLoadPhotos,
  onClose,
}: {
  match: MatchSummary | null;
  photos: { id: string; url: string }[] | undefined;
  photosFailed: boolean;
  onLoadPhotos: () => void;
  onClose: () => void;
}) {
  const { profile, country } = useDashboardData();
  const [lightbox, setLightbox] = useState<number | null>(null);

  const showPhotos = !!match && !match.closed && match.photosRevealed;
  const matchId = match?.id ?? null;

  // Ask for the photos once per match opened, when none are loaded yet
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!matchId || !showPhotos) {
      requestedFor.current = null;
      return;
    }
    if (photos !== undefined || photosFailed || requestedFor.current === matchId) return;
    requestedFor.current = matchId;
    onLoadPhotos();
  }, [matchId, showPhotos, photos, photosFailed, onLoadPhotos]);

  if (!match) return null;
  const p = match.partner;
  const title = p.age ? `${p.firstName}، ${p.age}` : p.firstName;
  const meta = [p.city, p.job].filter(Boolean).join(" · ");
  const firstPhoto = showPhotos ? photos?.[0]?.url : undefined;

  return (
    <DetailSheet open openKey={match.id} onClose={onClose} title={title}>
      <div className="flex flex-col items-center gap-2 text-center">
        <MemberAvatar name={p.firstName} size={96} photoUrl={firstPhoto} matched={!match.closed} dimmed={!!match.closed} />
        <SheetTitle className="font-display text-title">{title}</SheetTitle>
        {meta && <p className="text-label text-muted-foreground">{meta}</p>}
        <p className="text-caption text-accent-ink">توافق بتاريخ {formatDate(match.createdAt, country)}</p>
      </div>

      {showPhotos && (
        <div className="mt-5">
          {photosFailed ? (
            <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-muted/30 p-4 text-center">
              <p className="text-label text-muted-foreground">تعذّر تحميل الصور.</p>
              <button
                type="button"
                onClick={onLoadPhotos}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary/30 px-4 text-label font-semibold text-primary hover:bg-primary/5"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : photos === undefined ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-muted/30 p-6 text-label text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
              جاري تحميل الصور...
            </div>
          ) : (
            photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    type="button"
                    aria-label={`عرض الصورة ${i + 1}`}
                    onClick={() => setLightbox(i)}
                    onContextMenu={(e) => e.preventDefault()}
                    className="relative h-44 overflow-hidden rounded-lg"
                  >
                    <Image
                      src={photo.url}
                      alt="صورة الشريك"
                      fill
                      unoptimized
                      sizes="220px"
                      className="rounded-lg object-cover"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {p.aboutMe && (
          <section>
            <h3 className="mb-1.5 text-label font-bold text-foreground">{forPartner(profile?.gender, "عنه", "عنها")}</h3>
            <p className="whitespace-pre-line text-body text-ink">{p.aboutMe}</p>
          </section>
        )}
        <CandidateDetails c={p} flat />
      </div>

      {showPhotos && photos && photos.length > 0 && (
        <ImageLightbox
          images={photos.map((x) => x.url)}
          initialIndex={lightbox ?? 0}
          open={lightbox !== null}
          onClose={() => setLightbox(null)}
        />
      )}
    </DetailSheet>
  );
}
