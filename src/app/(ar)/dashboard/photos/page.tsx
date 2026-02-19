"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Camera,
  Trash2,
  Star,
  ImagePlus,
  ImageOff,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPhotos();
  }, []);

  async function fetchPhotos() {
    try {
      const res = await fetch("/api/profile/photos");
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch (err) {
      console.error("Failed to fetch photos", err);
    } finally {
      setLoading(false);
    }
  }

  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = MAX_PHOTOS - photos.length;
    const filesToUpload = Array.from(files).slice(0, remaining);

    setUploading(true);
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const photoData = await readFileAsDataURL(filesToUpload[i]);
        await fetch("/api/profile/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoData,
            isPrimary: photos.length === 0 && i === 0,
          }),
        });
      }
      await fetchPhotos();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }

    // Reset input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleDelete(photoId: string) {
    setDeletingId(photoId);
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-violet-200/30 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل الصور...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-violet-50/80 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-violet-100/40 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Camera className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-violet-600 bg-clip-text text-transparent">
                  صوري الشخصية
                </h1>
                <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold shadow-sm">
                  {photos.length} / {MAX_PHOTOS}
                </span>
              </div>
            </div>
            <p className="text-muted-foreground text-sm md:text-base">
              أضف صوراً لملفك الشخصي. سيتم عرضها فقط عند التوافق المتبادل
            </p>
          </div>

          {/* Upload button */}
          <div className="flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={photos.length >= MAX_PHOTOS || uploading}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={photos.length >= MAX_PHOTOS || uploading}
              className="bg-gradient-to-l from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg shadow-violet-500/20 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <ImagePlus className="h-4 w-4 me-2" />
              )}
              {uploading ? "جاري الرفع..." : "رفع صورة"}
            </Button>
          </div>
        </div>
      </div>

      {/* Privacy Banner */}
      <div className="flex items-center gap-3 p-3.5 bg-gradient-to-l from-primary/5 to-blue-50/50 rounded-xl border border-primary/10 text-sm text-muted-foreground">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Lock className="h-4 w-4 text-primary" />
        </div>
        <span className="leading-relaxed">
          صورك الشخصية لن تظهر لأي مستخدم إلا بعد التوافق المتبادل بينكما. لا يمكن لأي شخص آخر على المنصة الاطلاع عليها
        </span>
      </div>

      {/* Photo Grid */}
      {photos.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20 bg-gradient-to-b from-card to-violet-50/20">
          <CardContent className="text-center py-16 md:py-20 space-y-5">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-100/60 to-primary/10 rounded-full animate-pulse" />
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-violet-50 to-primary/5 flex items-center justify-center border-2 border-dashed border-violet-200/50">
                <ImageOff className="h-10 w-10 text-muted-foreground/40" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg text-foreground">لا توجد صور بعد</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                أضف صوراً لملفك الشخصي لتظهر عند التوافق المتبادل مع شريك محتمل.
              </p>
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="border-violet-200/60 text-violet-600 hover:bg-violet-50 hover:border-violet-300/60 rounded-xl font-semibold"
            >
              <ImagePlus className="h-4 w-4 me-2" />
              رفع أول صورة
            </Button>
          </CardContent>
        </Card>
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
                <img
                  src={photo.url}
                  alt={`صورة ${index + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Primary badge */}
                {photo.isPrimary && (
                  <div className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 backdrop-blur-sm text-white px-2.5 py-1 text-[10px] font-bold shadow-md">
                    <Star className="h-3 w-3 fill-white" />
                    رئيسية
                  </div>
                )}

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                  className="absolute top-2 end-2 h-8 w-8 rounded-full bg-red-500/90 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-600 hover:scale-110"
                >
                  {deletingId === photo.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
