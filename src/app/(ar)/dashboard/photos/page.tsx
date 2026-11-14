"use client";

import Image from "next/image";
import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";
import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Camera,
  Trash2,
  Star,
  ImagePlus,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTip } from "@/components/shared/banner-slot";
import { EmptyState } from "@/components/shared/line-art";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-loading";

interface Photo {
  id: string;
  url: string;
  isPrimary: boolean;
  order: number;
}

const MAX_PHOTOS = 5;

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const female = useDashboardData().profile?.gender === "FEMALE";

  useEffect(() => {
    fetchPhotos();
  }, []);

  async function fetchPhotos() {
    try {
      const res = await fetch("/api/profile/photos");
      if (!res.ok) throw new Error(`photos ${res.status}`);
      const data = await res.json();
      setPhotos(data.photos || []);
      setLoadFailed(false);
    } catch (err) {
      console.error("Failed to fetch photos", err);
      // Never claim "no photos yet" when the list just didn't load
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = MAX_PHOTOS - photos.length;
    const filesToUpload = Array.from(files).slice(0, remaining);
    if (files.length > filesToUpload.length) {
      toast.info(
        remaining <= 0
          ? `وصلت للحد الأقصى (${MAX_PHOTOS} صور)`
          : `يمكن رفع ${remaining === 1 ? "صورة واحدة" : remaining === 2 ? "صورتين" : `${remaining} صور`} فقط (الحد ${MAX_PHOTOS} صور)`
      );
      if (filesToUpload.length === 0) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setUploading(true);
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        let photoData: string;
        try {
          photoData = await compressImage(filesToUpload[i]);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "تعذّر تجهيز الصورة");
          continue;
        }
        const uploadRes = await fetch("/api/profile/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoData,
            isPrimary: photos.length === 0 && i === 0,
          }),
        });
        if (uploadRes.ok) {
          trackEvent("photo_uploaded");
        } else {
          const data = await uploadRes.json().catch(() => ({}));
          toast.error(data.error || "تعذّر رفع الصورة");
        }
      }
      await fetchPhotos();
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("تعذّر رفع الصور، يمكنك المحاولة مرة أخرى");
    } finally {
      setUploading(false);
    }

    // Reset input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function setPrimary(photoId: string) {
    if (settingPrimary) return;
    setSettingPrimary(photoId);
    const res = await fetch(`/api/profile/photos/${photoId}`, { method: "PATCH" }).catch(() => null);
    setSettingPrimary(null);
    if (res?.ok) {
      setPhotos((prev) => prev.map((p) => ({ ...p, isPrimary: p.id === photoId })));
      toast.success("تم تعيين الصورة الرئيسية");
    } else {
      toast.error("تعذّر تعيين الصورة الرئيسية");
    }
  }

  async function handleDelete(photoId: string) {
    // First tap asks, second tap (within 4s) deletes
    if (confirmDeleteId !== photoId) {
      setConfirmDeleteId(photoId);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === photoId ? null : cur)), 4000);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(photoId);
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchPhotos();
        toast.success("تم حذف الصورة");
      } else {
        toast.error("تعذّر حذف الصورة");
      }
    } catch (err) {
      console.error("Delete failed", err);
      toast.error("تعذّر حذف الصورة، يمكنك التحقق من الاتصال والمحاولة مرة أخرى");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <PageLoading width="max-w-2xl" label="جارٍ تحميل الصور…" />;
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        icon={Camera}
        title="صوري الشخصية"
        description={female ? "أضيفي صوراً لملفكِ الشخصي. سيتم عرضها فقط عند التوافق المتبادل" : "أضف صوراً لملفك الشخصي. سيتم عرضها فقط عند التوافق المتبادل"}
      >
        {/* «2 من 5» reads in order in RTL («5 / 2» didn't, QA DS-10); nothing to count while the list failed (WM-18) */}
        {!loadFailed && (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-accent/40 bg-accent/10 px-3 text-sm font-bold text-foreground">
            {photos.length} من {MAX_PHOTOS}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleUpload}
          disabled={loadFailed || photos.length >= MAX_PHOTOS || uploading}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          // Never upload over a list that didn't load: the count (and the 5-photo limit) would be wrong (QA WM-18)
          disabled={loadFailed || loading || photos.length >= MAX_PHOTOS || uploading}
          className="h-11 rounded-xl font-semibold"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin me-2" />
          ) : (
            <ImagePlus className="h-4 w-4 me-2" />
          )}
          {uploading ? "جاري الرفع..." : "رفع صورة"}
        </Button>
      </PageHeader>
      {/* The page's tip sits in its content, under the title (P1-5) */}
      <PageTip
        storageKey="naseeb_tip_photos"
        title="صور واضحة، فرص أكبر"
        // The privacy sentence is the banner below; the tip doesn't repeat it (QA WA-20)
        body={`${female ? "تأكدي" : "تأكد"} من إضافة صور واضحة لزيادة فرصك في التوافق.`}
      />

      {/* Privacy: one quiet line, not a second banner (the slot above holds the one banner; QA DS-05) */}
      <p className="flex items-start gap-2 text-label font-normal text-muted-ink">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>لا تظهر صورك بوضوح إلا بعد توافق متبادل. قبل التوافق تظهر لمن تُقترح عليهم نسخة ضبابية جداً من صورتك الرئيسية.</span>
      </p>

      {/* Photo Grid */}
      {loadFailed && photos.length === 0 ? (
        <LoadError
          message="تعذّر تحميل صورك. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={() => {
            setLoading(true);
            fetchPhotos();
          }}
        />
      ) : photos.length === 0 ? (
        <EmptyState art="window" title="لا توجد صور بعد" description={female ? "أضيفي صوراً لملفكِ الشخصي لتظهر عند التوافق المتبادل مع شريك محتمل." : "أضف صوراً لملفك الشخصي لتظهر عند التوافق المتبادل مع شريك محتمل."}>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-11 rounded-xl font-semibold">
            <ImagePlus className="h-4 w-4 me-2" aria-hidden />
            رفع أول صورة
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative rounded-2xl overflow-hidden border border-border/50 bg-card shadow-sm hover:shadow-lg transition-all duration-300"
              style={{
                animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
              }}
            >
              <div className="aspect-square relative">
                <Image
                  src={photo.url}
                  alt={`صورة ${index + 1}`}
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="object-cover cursor-pointer"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                {/* Primary badge, or make this one the main photo */}
                {photo.isPrimary ? (
                  <div className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full bg-accent/90 backdrop-blur-sm text-accent-foreground px-2.5 py-1 text-xs font-bold shadow-md">
                    <Star className="h-3 w-3 fill-current" />
                    رئيسية
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPrimary(photo.id); }}
                    disabled={!!settingPrimary}
                    className="absolute bottom-2 start-2 inline-flex min-h-11 items-center gap-1 rounded-full bg-card/90 backdrop-blur-sm px-3 text-xs font-semibold text-foreground shadow-md hover:bg-card disabled:opacity-70"
                  >
                    {settingPrimary === photo.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                    اجعلها الرئيسية
                  </button>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                  disabled={deletingId === photo.id}
                  aria-label={confirmDeleteId === photo.id ? "تأكيد الحذف" : "حذف الصورة"}
                  className={`absolute top-2 end-2 h-11 rounded-full bg-destructive/90 backdrop-blur-sm text-destructive-foreground flex items-center justify-center gap-1 transition-all duration-300 hover:bg-destructive ${
                    confirmDeleteId === photo.id ? "px-3 text-xs font-bold opacity-100" : "w-11 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  }`}
                >
                  {deletingId === photo.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : confirmDeleteId === photo.id ? (
                    "تأكيد الحذف"
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {photos.length >= MAX_PHOTOS && (
        <p className="text-center text-sm text-muted-foreground">
          وصلت للحد الأقصى ({MAX_PHOTOS} صور). احذف صورة لرفع واحدة جديدة.
        </p>
      )}

      <ImageLightbox
        images={photos.map((p) => p.url)}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Inline keyframes style */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
