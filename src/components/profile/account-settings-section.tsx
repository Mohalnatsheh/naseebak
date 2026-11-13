"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Loader2, Ban, AlertCircle, Trash2 } from "lucide-react";
import { useCountry, useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * «إعدادات الحساب»: pause the account, or ask to delete it (30-day grace), with their confirm steps, the
 * pending-deletion state and the Pro renewal lines. Moved as is from the bottom of the profile page; shown
 * there with `dashboard_redesign` off, and on its own page `/dashboard/account/settings` with it on.
 */
export function AccountSettingsSection({ isMale }: { isMale: boolean }) {
  const { pro } = useDashboardData().counts;
  const country = useCountry();
  const [deactivating, setDeactivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<{
    scheduledAt: string;
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletionLoading, setDeletionLoading] = useState(false);

  useEffect(() => {
    async function fetchDeletionStatus() {
      try {
        const res = await fetch("/api/profile/delete");
        const data = await res.json();
        if (data.hasPendingDeletion) {
          setDeletionRequest(data.deletionRequest);
        }
      } catch {
        // Silently fail
      }
    }
    fetchDeletionStatus();
  }, []);

  return (
    <>
      {/* ============================================ */}
      {/*  Deactivate Account                          */}
      {/* ============================================ */}
      <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.55s both" }}>
        {/* Pausing is reversible: amber, not the red of permanent deletion */}
        <Card className="relative overflow-hidden border-amber-200/70 shadow-sm">
          <div className="h-1 bg-gradient-to-l from-amber-300 to-amber-500" />
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Ban className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base">
                    تعطيل الحساب مؤقتاً
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {isMale
                      ? "سيتم إخفاء ملفك الشخصي ولن تتلقى اقتراحات جديدة. يمكنك إعادة تفعيله في أي وقت بتسجيل الدخول مجدداً."
                      : "سيتم إخفاء ملفكِ الشخصي ولن تتلقي اقتراحات جديدة. يمكنكِ إعادة تفعيله في أي وقت بتسجيل الدخول مجدداً."}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="h-11 border-amber-300 text-amber-800 hover:bg-amber-50 shrink-0 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => setShowDeactivateConfirm(true)}
              >
                <Ban className="h-4 w-4 me-2" />
                تعطيل الحساب
              </Button>
            </div>

            {showDeactivateConfirm && (
              <div className="mt-5 p-5 bg-gradient-to-l from-destructive/5 to-destructive/[0.03] rounded-xl border border-destructive/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    {isMale ? "هل أنت متأكد من رغبتك في تعطيل حسابك؟" : "هل أنتِ متأكدة من رغبتكِ في تعطيل حسابكِ؟"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isMale
                    ? "سيتم إخفاء ملفك الشخصي من جميع الاقتراحات، وتظهر توافقاتك للطرف الآخر مغلقة فلا مراسلة ولا طلبات تعارف حتى تعيد التفعيل. يبقى رصيدك كما هو، ويمكنك إعادة تفعيل حسابك في أي وقت عبر تسجيل الدخول مجددًا."
                    : "سيتم إخفاء ملفكِ الشخصي من جميع الاقتراحات، وتظهر توافقاتكِ للطرف الآخر مغلقة فلا مراسلة ولا طلبات تعارف حتى تعيدي التفعيل. يبقى رصيدكِ كما هو، ويمكنكِ إعادة تفعيل حسابكِ في أي وقت عبر تسجيل الدخول مجددًا."}
                </p>
                {/* A paused member must not keep paying (IOS-H01 ruling): say it before the pause */}
                {pro?.isPro && !pro.cancelAtPeriodEnd && (
                  <p className="text-xs font-semibold leading-relaxed text-foreground">
                    يتوقف تجديد اشتراك Pro دون استرداد، وتبقى مزاياه حتى نهاية المدة المدفوعة. بعد إعادة التفعيل يمكنك متابعة الاشتراك من صفحة عضوية Pro.
                  </p>
                )}
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    disabled={deactivating}
                    className="rounded-xl font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                    onClick={async () => {
                      setDeactivating(true);
                      try {
                        const res = await fetch("/api/profile/deactivate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "pause" }),
                        });
                        if (res.ok) {
                          // Full reload: the dashboard now shows the reactivation page only
                          window.location.href = "/dashboard/reactivate";
                          return;
                        }
                        const data = await res.json().catch(() => ({}));
                        toast.error(data.error || "تعذّر تعطيل الحساب. يمكنك المحاولة مرة أخرى.");
                      } catch {
                        toast.error("حدث خطأ في الاتصال. يمكنك المحاولة مرة أخرى.");
                      } finally {
                        setDeactivating(false);
                      }
                    }}
                  >
                    {deactivating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "نعم، تعطيل الحساب"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl font-semibold"
                    onClick={() => setShowDeactivateConfirm(false)}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================ */}
      {/*  Account Deletion (30-day grace period)       */}
      {/* ============================================ */}
      <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.6s both" }}>
        <Card className="relative overflow-hidden border-destructive/20 shadow-sm">
          <div className="h-1 bg-gradient-to-l from-destructive to-destructive/70" />
          <CardContent className="p-5 md:p-6">
            {deletionRequest ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-bold text-destructive text-base">
                      حذف الحساب قيد التنفيذ
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      سيتم حذف حسابك نهائياً في{" "}
                      <span className="font-bold text-destructive">
                        {formatDate(deletionRequest.scheduledAt, country.code, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                      . يمكنك إلغاء الطلب قبل هذا الموعد.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 rounded-xl font-semibold"
                  disabled={deletionLoading}
                  onClick={async () => {
                    setDeletionLoading(true);
                    try {
                      const res = await fetch("/api/profile/delete", {
                        method: "DELETE",
                      });
                      if (res.ok) {
                        setDeletionRequest(null);
                        setShowDeleteConfirm(false);
                      } else {
                        toast.error("تعذّر إلغاء طلب الحذف. يمكنك المحاولة مرة أخرى.");
                      }
                    } catch {
                      toast.error("حدث خطأ في الاتصال. يمكنك المحاولة مرة أخرى.");
                    } finally {
                      setDeletionLoading(false);
                    }
                  }}
                >
                  {deletionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "إلغاء طلب الحذف وتفعيل الحساب"
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-bold text-destructive text-base">
                      حذف الحساب نهائياً
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      سيتم حذف جميع بياناتك نهائياً بعد 30 يوماً من تقديم
                      الطلب. لا يمكن استعادة البيانات بعد الحذف.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-11 border-destructive/30 text-destructive hover:bg-destructive/5 hover:border-destructive/50 shrink-0 rounded-xl font-semibold"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  حذف الحساب
                </Button>
              </div>
            )}

            {showDeleteConfirm && !deletionRequest && (
              <div className="mt-5 p-5 bg-gradient-to-l from-destructive/5 to-destructive/[0.03] rounded-xl border border-destructive/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    {isMale ? "هل أنت متأكد من رغبتك في حذف حسابك نهائياً؟" : "هل أنتِ متأكدة من رغبتكِ في حذف حسابكِ نهائياً؟"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيتم تعطيل حسابك فوراً وحذفه نهائياً بعد 30 يوماً، ومعه
                  توافقاتك ومحادثاتك ورصيدك المتبقي (لا يُسترجع). يمكنك إلغاء
                  الطلب خلال هذه الفترة بتسجيل الدخول مجدداً.
                </p>
                {pro?.isPro && (
                  <p className="text-xs font-semibold leading-relaxed text-foreground">
                    يتوقف تجديد اشتراك Pro فوراً دون استرداد، وينتهي الاشتراك عند حذف الحساب.
                  </p>
                )}
                <div className="space-y-2">
                  <label htmlFor="delete-reason" className="text-sm font-medium text-foreground">
                    سبب الحذف (اختياري)
                  </label>
                  <textarea
                    id="delete-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[60px] resize-none"
                    placeholder="رأيك يساعدنا في تحسين المنصة..."
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    disabled={deletionLoading}
                    className="rounded-xl font-semibold"
                    onClick={async () => {
                      setDeletionLoading(true);
                      try {
                        const res = await fetch("/api/profile/delete", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            reason: deleteReason || undefined,
                          }),
                        });
                        if (res.ok) {
                          // The account is deactivated right away: show the
                          // reactivation page (deletion date + cancel button)
                          window.location.href = "/dashboard/reactivate";
                          return;
                        }
                        const data = await res.json().catch(() => ({}));
                        toast.error(data.error || "تعذّر إرسال طلب الحذف. يمكنك المحاولة مرة أخرى.");
                      } catch {
                        toast.error("حدث خطأ في الاتصال. يمكنك المحاولة مرة أخرى.");
                      } finally {
                        setDeletionLoading(false);
                      }
                    }}
                  >
                    {deletionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "نعم، حذف الحساب"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl font-semibold"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
