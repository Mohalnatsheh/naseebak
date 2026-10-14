"use client";

import { useState, useEffect, useRef } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Camera,
  ScanFace,
  Lock,
  Eye,
  BadgeCheck,
  AlertTriangle,
  Sparkles,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FirstVisitTip } from "@/components/shared/first-visit-tip";
import { compressImageToDataUrl } from "@/lib/compress-image";
import { trackEvent } from "@/lib/analytics";

type DocStatus = {
  doc: {
    id: string;
    documentType: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    reviewNotes: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
};

export default function IdentityPage() {
  const [doc, setDoc] = useState<DocStatus["doc"]>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Selfie file
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/identity/status");
      const data = await res.json();
      setDoc(data.doc);
    } catch {
      console.error("Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(file: File | null) {
    if (!file) return;

    // Large camera photos are fine — they are resized in the browser before upload
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("حجم الصورة كبير جداً. يرجى اختيار صورة أصغر");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("يرجى اختيار صورة");
      return;
    }

    setError("");
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (!selfieFile) {
      setError("يرجى التقاط صورة شخصية (سيلفي)");
      return;
    }

    setError("");
    setUploading(true);

    try {
      let selfieBase64: string;
      try {
        selfieBase64 = await compressImageToDataUrl(selfieFile);
      } catch {
        setError("تعذّر قراءة الصورة. يرجى استخدام صورة بصيغة JPG أو PNG");
        return;
      }

      const res = await fetch("/api/identity/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selfieImageData: selfieBase64 }),
      });

      if (!res.ok) {
        // The response may not be JSON (e.g. a proxy error page)
        const data = await res.json().catch(() => null);
        setError(data?.error || (res.status === 413 ? "حجم الصورة كبير جداً" : "حدث خطأ أثناء الرفع. حاول مرة أخرى"));
      } else {
        trackEvent("verification_submitted");
        await fetchStatus();
        setSelfieFile(null);
        setSelfiePreview(null);
      }
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جاري التحقق من حالة الهوية...</p>
      </div>
    );
  }

  const showUploadForm = !doc || doc.status === "REJECTED";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      <FirstVisitTip
        storageKey="naseeb_tip_identity"
        icon={<ShieldCheck className="h-5 w-5 text-primary" />}
        title="لماذا أوثّق حسابي؟"
        body="التوثيق اختياري، لكنه يضيف شارة الحساب الموثّق ويزيد من مصداقية ملفك لدى فريقنا. صورتك محمية ولن يطّلع عليها أي مستخدم آخر."
      />
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/10 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-primary/10 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
              التحقق من الهوية
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            توثيق الحساب اختياري. التقط صورة سيلفي واضحة لوجهك للحصول على شارة الحساب الموثّق — لا نطلب أي وثائق حكومية.
          </p>
        </div>
      </div>

      {/* Status Cards */}
      {doc && doc.status === "PENDING" && (
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
          <Card className="group overflow-hidden border-amber-200/60 hover:border-amber-300/80 hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300">
            <div className="h-1.5 bg-gradient-to-l from-amber-400 via-yellow-500 to-orange-400" />
            <CardContent className="relative p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/30 rounded-full translate-x-10 -translate-y-10 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-yellow-100/20 rounded-full -translate-x-8 translate-y-8 blur-2xl" />

              <div className="relative flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-50 flex items-center justify-center border border-amber-200/40">
                    <Clock className="h-7 w-7 text-amber-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg bg-gradient-to-l from-amber-600 to-orange-600 bg-clip-text text-transparent">
                    قيد المراجعة
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    تم استلام صورتك وهي قيد المراجعة من قبل الإدارة. سيتم إبلاغك بالنتيجة.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex items-center text-[11px] text-amber-700 bg-amber-50 border border-amber-200/50 rounded-lg px-3 py-1 font-medium">
                      <Clock className="h-3 w-3 me-1.5" />
                      يتم عادةً خلال 24 ساعة
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {doc && doc.status === "APPROVED" && (
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
          <Card className="group overflow-hidden border-emerald-200/60 hover:border-emerald-300/80 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300">
            <div className="h-1.5 bg-gradient-to-l from-emerald-400 via-green-500 to-emerald-600" />
            <CardContent className="relative p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/30 rounded-full translate-x-10 -translate-y-10 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-green-100/20 rounded-full -translate-x-8 translate-y-8 blur-2xl" />

              <div className="relative flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-100 via-green-50 to-emerald-50 flex items-center justify-center border border-emerald-200/40">
                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-sm">
                    <Sparkles className="h-2.5 w-2.5 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg bg-gradient-to-l from-emerald-600 to-green-600 bg-clip-text text-transparent">
                      تم التحقق بنجاح
                    </h3>
                    <span className="inline-flex items-center bg-gradient-to-l from-emerald-500 to-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                      <BadgeCheck className="h-3 w-3 me-1" />
                      موثّق
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    تم التحقق من هويتك بنجاح. حسابك الآن يحمل شارة الحساب الموثّق.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {doc && doc.status === "REJECTED" && (
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
          <Card className="group overflow-hidden border-destructive/30 hover:border-destructive/50 hover:shadow-xl hover:shadow-destructive/5 transition-all duration-300">
            <div className="h-1.5 bg-gradient-to-l from-destructive/70 via-destructive to-destructive/80" />
            <CardContent className="relative p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full translate-x-10 -translate-y-10 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-destructive/5 rounded-full -translate-x-8 translate-y-8 blur-2xl" />

              <div className="relative flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-destructive/15 via-destructive/5 to-destructive/10 flex items-center justify-center border border-destructive/20">
                    <XCircle className="h-7 w-7 text-destructive" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center">
                    <AlertTriangle className="h-2.5 w-2.5 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-destructive">
                    مرفوض
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    تم رفض صورة التحقق. يرجى التقاط صورة سيلفي جديدة وواضحة.
                  </p>
                  {doc.reviewNotes && (
                    <div className="mt-3 p-3 bg-destructive/5 border border-destructive/20 rounded-xl">
                      <p className="text-sm text-destructive">
                        <strong className="text-destructive font-bold">ملاحظات المراجع:</strong> {doc.reviewNotes}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex items-center text-[11px] text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-1 font-medium">
                      <Upload className="h-3 w-3 me-1.5" />
                      يرجى إعادة الرفع أدناه
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Form - Selfie */}
      {showUploadForm && (
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.2s both" }}>
          <Card className="group overflow-hidden border-border/50 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
            <div className="h-1.5 bg-gradient-to-l from-primary via-primary/70 to-primary/40" />
            <CardContent className="relative p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-10 -translate-y-10 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/3 rounded-full -translate-x-8 translate-y-8 blur-2xl" />

              <div className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/10">
                    <ScanFace className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-foreground">التقاط صورة سيلفي</h2>
                    <p className="text-xs text-muted-foreground">
                      التقط صورة واضحة لوجهك ليتمكن فريقنا من التحقق من أنك صاحب الحساب
                    </p>
                  </div>
                </div>

                <form onSubmit={handleUpload} className="space-y-5 mt-5">
                  {/* Error display */}
                  {error && (
                    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-destructive/10 to-destructive/5 border border-destructive/20 p-4">
                      <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                      <p className="text-sm text-destructive font-medium">{error}</p>
                    </div>
                  )}

                  {/* Selfie tips */}
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {[
                      "وجهك واضح ومكشوف بالكامل",
                      "إضاءة جيدة بدون ظلال قوية",
                      "بدون نظارات شمسية أو فلاتر",
                      "صورة حديثة ملتقطة الآن",
                    ].map((tip) => (
                      <li key={tip} className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border/50 px-3 py-2">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>

                  {/* Selfie */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Camera className="h-4 w-4 text-primary" />
                      صورة شخصية (سيلفي)
                    </Label>
                    <input
                      ref={selfieInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                    />
                    {selfiePreview ? (
                      <div className="relative mx-auto w-56 rounded-2xl border-2 border-primary/30 overflow-hidden group/img shadow-md">
                        <img src={selfiePreview} alt="الصورة الشخصية" className="w-full h-72 object-cover" />
                        <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md">
                          <Check className="h-4 w-4" />
                        </div>
                        <button
                          type="button"
                          onClick={() => selfieInputRef.current?.click()}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center text-white text-sm font-medium backdrop-blur-sm"
                        >
                          <Camera className="h-5 w-5 me-2" />
                          إعادة الالتقاط
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selfieInputRef.current?.click()}
                        className="group/upload w-full h-56 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/30 hover:shadow-inner flex flex-col items-center justify-center gap-3 transition-all duration-300"
                      >
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 text-muted-foreground group-hover/upload:bg-primary/10 group-hover/upload:text-primary group-hover/upload:scale-105 transition-all duration-300">
                          <Camera className="h-8 w-8" />
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-medium text-foreground/80">اضغط لالتقاط صورة سيلفي</span>
                          <br />
                          <span className="text-xs text-muted-foreground">JPG أو PNG — يتم ضغط الصورة تلقائياً</span>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Info banner */}
                  <div className="flex items-center gap-3 p-3.5 bg-gradient-to-l from-primary/5 to-primary/[0.03] rounded-xl border border-primary/10 text-sm text-muted-foreground">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <span className="leading-relaxed">
                      صورة السيلفي تُستخدم فقط للتحقق من هويتك ولن يطّلع عليها أي مستخدم آخر. تتم مراجعتها بسرية تامة من قبل الإدارة
                    </span>
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl font-bold text-base bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border-0"
                    disabled={uploading || !selfieFile}
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 me-2" />
                        إرسال الصورة
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trust Badges */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        style={{ animation: "fadeSlideIn 0.5s ease-out 0.4s both" }}
      >
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-primary/10 to-transparent border border-primary/20 p-4 hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/20">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold text-primary">تشفير كامل</p>
            <p className="text-[10px] text-primary/70 mt-0.5">AES-256 encryption</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-primary/10 to-transparent border border-primary/20 p-4 hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/20">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold text-primary">مراجعة خلال 24 ساعة</p>
            <p className="text-[10px] text-primary/70 mt-0.5">فريق مختص</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-primary/10 to-transparent border border-primary/20 p-4 hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/20">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold text-primary">بيانات محمية</p>
            <p className="text-[10px] text-primary/70 mt-0.5">خصوصية تامة</p>
          </div>
        </div>
      </div>

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
