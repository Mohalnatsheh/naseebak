"use client";

import { useState, useEffect, useRef } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  CreditCard,
  BookOpen,
  Lock,
  Eye,
  BadgeCheck,
  AlertTriangle,
  Sparkles,
  FileCheck,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function IdentityPage() {
  const [doc, setDoc] = useState<DocStatus["doc"]>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState("national_id");
  const [error, setError] = useState("");

  // Front + back document files
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileSelect(file: File | null, side: "front" | "back") {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("حجم الملف يجب أن يكون أقل من 5 ميجابايت");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("يرجى اختيار صورة بصيغة JPG أو PNG أو WebP");
      return;
    }

    setError("");
    const previewUrl = URL.createObjectURL(file);

    if (side === "front") {
      setFrontFile(file);
      setFrontPreview(previewUrl);
    } else {
      setBackFile(file);
      setBackPreview(previewUrl);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (!frontFile) {
      setError("يرجى رفع صورة الوجه الأمامي للهوية");
      return;
    }
    if (!backFile) {
      setError("يرجى رفع صورة الوجه الخلفي للهوية");
      return;
    }

    setError("");
    setUploading(true);

    try {
      const [frontBase64, backBase64] = await Promise.all([
        fileToBase64(frontFile),
        fileToBase64(backFile),
      ]);

      const res = await fetch("/api/identity/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          frontImageData: frontBase64,
          backImageData: backBase64,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "حدث خطأ أثناء الرفع");
      } else {
        await fetchStatus();
        setFrontFile(null);
        setBackFile(null);
        setFrontPreview(null);
        setBackPreview(null);
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
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-blue-200/30 flex items-center justify-center">
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
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-blue-50/80 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-blue-100/40 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-primary flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-blue-600 bg-clip-text text-transparent">
              التحقق من الهوية
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            يجب التحقق من هويتك قبل استخدام المنصة. قم برفع صورة واضحة للوجهين الأمامي والخلفي للهوية.
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
                    تم استلام وثائقك وهي قيد المراجعة من قبل الإدارة. سيتم إبلاغك بالنتيجة.
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
                    تم التحقق من هويتك بنجاح. يمكنك الآن استخدام جميع ميزات المنصة.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {doc && doc.status === "REJECTED" && (
        <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
          <Card className="group overflow-hidden border-red-200/60 hover:border-red-300/80 hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300">
            <div className="h-1.5 bg-gradient-to-l from-red-400 via-rose-500 to-red-600" />
            <CardContent className="relative p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/30 rounded-full translate-x-10 -translate-y-10 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-rose-100/20 rounded-full -translate-x-8 translate-y-8 blur-2xl" />

              <div className="relative flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-100 via-rose-50 to-red-50 flex items-center justify-center border border-red-200/40">
                    <XCircle className="h-7 w-7 text-red-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-400 flex items-center justify-center">
                    <AlertTriangle className="h-2.5 w-2.5 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg bg-gradient-to-l from-red-600 to-rose-600 bg-clip-text text-transparent">
                    مرفوض
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    تم رفض وثيقة الهوية. يرجى رفع وثيقة جديدة واضحة.
                  </p>
                  {doc.reviewNotes && (
                    <div className="mt-3 p-3 bg-red-50/80 border border-red-200/40 rounded-xl">
                      <p className="text-sm text-red-800">
                        <strong className="text-red-700">ملاحظات المراجع:</strong> {doc.reviewNotes}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex items-center text-[11px] text-red-700 bg-red-50 border border-red-200/50 rounded-lg px-3 py-1 font-medium">
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

      {/* Upload Form - Front + Back */}
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
                    <FileCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-foreground">رفع وثائق الهوية</h2>
                    <p className="text-xs text-muted-foreground">
                      يرجى رفع صورة واضحة للوجهين الأمامي والخلفي للهوية الحكومية
                    </p>
                  </div>
                </div>

                <form onSubmit={handleUpload} className="space-y-5 mt-5">
                  {/* Error display */}
                  {error && (
                    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-red-50 to-rose-50/80 border border-red-200/50 p-4">
                      <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      </div>
                      <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                  )}

                  {/* Document type selector */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-foreground">نوع الوثيقة</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDocumentType("national_id")}
                        className={`group/btn relative overflow-hidden rounded-xl border-2 px-4 py-4 text-sm font-semibold transition-all duration-300 ${
                          documentType === "national_id"
                            ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent text-primary shadow-md shadow-primary/10"
                            : "border-border/60 hover:border-primary/40 hover:bg-primary/[0.02]"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2.5">
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                            documentType === "national_id"
                              ? "bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20"
                              : "bg-muted/60 border border-border/50 group-hover/btn:bg-primary/10"
                          }`}>
                            <CreditCard className={`h-5 w-5 transition-colors ${
                              documentType === "national_id" ? "text-white" : "text-muted-foreground group-hover/btn:text-primary"
                            }`} />
                          </div>
                          <span>بطاقة هوية وطنية</span>
                        </div>
                        {documentType === "national_id" && (
                          <div className="absolute top-2 left-2">
                            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentType("passport")}
                        className={`group/btn relative overflow-hidden rounded-xl border-2 px-4 py-4 text-sm font-semibold transition-all duration-300 ${
                          documentType === "passport"
                            ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent text-primary shadow-md shadow-primary/10"
                            : "border-border/60 hover:border-primary/40 hover:bg-primary/[0.02]"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2.5">
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                            documentType === "passport"
                              ? "bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20"
                              : "bg-muted/60 border border-border/50 group-hover/btn:bg-primary/10"
                          }`}>
                            <BookOpen className={`h-5 w-5 transition-colors ${
                              documentType === "passport" ? "text-white" : "text-muted-foreground group-hover/btn:text-primary"
                            }`} />
                          </div>
                          <span>جواز سفر</span>
                        </div>
                        {documentType === "passport" && (
                          <div className="absolute top-2 left-2">
                            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Front of ID */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">1</div>
                      الوجه الأمامي للهوية
                    </Label>
                    <input
                      ref={frontInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null, "front")}
                    />
                    {frontPreview ? (
                      <div className="relative rounded-2xl border-2 border-primary/30 overflow-hidden group/img shadow-md">
                        <img src={frontPreview} alt="الوجه الأمامي" className="w-full h-48 object-cover" />
                        <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md">
                          <Check className="h-4 w-4" />
                        </div>
                        <button
                          type="button"
                          onClick={() => frontInputRef.current?.click()}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center text-white text-sm font-medium backdrop-blur-sm"
                        >
                          <Upload className="h-5 w-5 me-2" />
                          تغيير الصورة
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => frontInputRef.current?.click()}
                        className="group/upload w-full h-44 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/30 hover:shadow-inner flex flex-col items-center justify-center gap-3 transition-all duration-300"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground group-hover/upload:bg-primary/10 group-hover/upload:text-primary group-hover/upload:scale-105 transition-all duration-300">
                          <Upload className="h-7 w-7" />
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-medium text-foreground/80">اضغط لرفع الصورة الأمامية</span>
                          <br />
                          <span className="text-xs text-muted-foreground">JPG, PNG, WebP — حد أقصى 5MB</span>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Back of ID */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">2</div>
                      الوجه الخلفي للهوية
                    </Label>
                    <input
                      ref={backInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null, "back")}
                    />
                    {backPreview ? (
                      <div className="relative rounded-2xl border-2 border-primary/30 overflow-hidden group/img shadow-md">
                        <img src={backPreview} alt="الوجه الخلفي" className="w-full h-48 object-cover" />
                        <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md">
                          <Check className="h-4 w-4" />
                        </div>
                        <button
                          type="button"
                          onClick={() => backInputRef.current?.click()}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center text-white text-sm font-medium backdrop-blur-sm"
                        >
                          <Upload className="h-5 w-5 me-2" />
                          تغيير الصورة
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => backInputRef.current?.click()}
                        className="group/upload w-full h-44 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/30 hover:shadow-inner flex flex-col items-center justify-center gap-3 transition-all duration-300"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground group-hover/upload:bg-primary/10 group-hover/upload:text-primary group-hover/upload:scale-105 transition-all duration-300">
                          <Upload className="h-7 w-7" />
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-medium text-foreground/80">اضغط لرفع الصورة الخلفية</span>
                          <br />
                          <span className="text-xs text-muted-foreground">JPG, PNG, WebP — حد أقصى 5MB</span>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Info banner */}
                  <div className="flex items-center gap-3 p-3.5 bg-gradient-to-l from-primary/5 to-blue-50/50 rounded-xl border border-primary/10 text-sm text-muted-foreground">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <span className="leading-relaxed">
                      وثائق الهوية تُستخدم فقط للتحقق من هويتك ولن يطّلع عليها أي مستخدم آخر. يتم مراجعتها بسرية تامة من قبل الإدارة
                    </span>
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl font-bold text-base bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border-0"
                    disabled={uploading || !frontFile || !backFile}
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 me-2" />
                        رفع الوثائق
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
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-blue-50/80 to-transparent border border-blue-200/40 p-4 hover:shadow-md hover:shadow-blue-500/5 transition-all duration-300">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0 border border-blue-200/40">
            <Lock className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-blue-700">تشفير كامل</p>
            <p className="text-[10px] text-blue-600/70 mt-0.5">AES-256 encryption</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-blue-50/80 to-transparent border border-blue-200/40 p-4 hover:shadow-md hover:shadow-blue-500/5 transition-all duration-300">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0 border border-blue-200/40">
            <Eye className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-blue-700">مراجعة خلال 24 ساعة</p>
            <p className="text-[10px] text-blue-600/70 mt-0.5">فريق مختص</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-purple-50/80 to-transparent border border-purple-200/40 p-4 hover:shadow-md hover:shadow-purple-500/5 transition-all duration-300">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center flex-shrink-0 border border-purple-200/40">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-purple-700">بيانات محمية</p>
            <p className="text-[10px] text-purple-600/70 mt-0.5">خصوصية تامة</p>
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
