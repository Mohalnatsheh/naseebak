"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { LoadError } from "@/components/shared/load-error";
import { EmptyState } from "@/components/shared/line-art";
import { MemberAvatar } from "@/components/shared/member-avatar";

interface BlockRow {
  id: string;
  createdAt: string;
  blocked: { id: string; firstName: string };
}

/** People I blocked, with unblock (GET /api/blocks, DELETE /api/blocks/[id]). */
export default function BlocksPage() {
  const { country } = useDashboardData();
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<BlockRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/blocks");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A fixed message, never the server's own text (QA WA-19)
        console.error("Blocks load failed:", res.status, data.error);
        setError("تعذّر تحميل قائمة المحظورين. يمكنك المحاولة مرة أخرى.");
        return;
      }
      setError(null);
      setBlocks(data.blocks ?? []);
    } catch {
      setError("تعذّر الاتصال. يمكنك التحقق من الإنترنت والمحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unblock() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/blocks/${target.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "تعذّر إلغاء الحظر، يمكنك المحاولة مرة أخرى");
        return;
      }
      toast.success("تم إلغاء الحظر");
      setTarget(null);
      await load();
    } catch {
      toast.error("تعذّر الاتصال. يمكنك التحقق من الإنترنت والمحاولة مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        icon={Ban}
        title="المحظورون"
        description="المحظور لا يرى ملفك، ولن يُقترح أحدكما على الآخر."
      />

      {loading ? (
        <div role="status" className="flex min-h-[50vh] justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <span className="sr-only">جارٍ التحميل…</span>
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : blocks.length === 0 ? (
        <EmptyState art="door" title="لا يوجد أشخاص محظورون" description="يمكنك حظر أي شخص من قائمة الخيارات في بطاقته." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <MemberAvatar name={b.blocked.firstName} size={40} dimmed />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{b.blocked.firstName}</p>
                  <p className="text-xs text-muted-foreground">
                    حُظر بتاريخ {formatDate(b.createdAt, country)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setTarget(b)}>
                  <ShieldOff className="h-4 w-4" />
                  إلغاء الحظر
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmActionDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`إلغاء حظر ${target?.blocked.firstName ?? ""}`}
        description="إن كان بينكما توافق فسيعود ظاهراً لكما. الطلبات التي أُلغيت بسبب الحظر لا تعود."
        confirmLabel="إلغاء الحظر"
        busy={busy}
        onConfirm={unblock}
      />
    </div>
  );
}
