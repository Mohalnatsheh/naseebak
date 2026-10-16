"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Loader2, ShieldOff, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";

interface BlockRow {
  id: string;
  createdAt: string;
  blocked: { id: string; firstName: string };
}

/** People I blocked, with unblock (GET /api/blocks, DELETE /api/blocks/[id]). */
export default function BlocksPage() {
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
        setError(data.error ?? "تعذّر تحميل القائمة");
        return;
      }
      setError(null);
      setBlocks(data.blocks ?? []);
    } catch {
      setError("تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.");
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
        toast.error(data.error ?? "تعذّر إلغاء الحظر، حاول مرة أخرى");
        return;
      }
      toast.success("تم إلغاء الحظر");
      setTarget(null);
      await load();
    } catch {
      toast.error("تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary/5 via-secondary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Ban className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
            المحظورون
          </h1>
        </div>
        <p className="mt-2 text-muted-foreground text-sm md:text-base">
          الأشخاص الذين حظرتهم لا يرون ملفك ولا تظهر لهم توافقاتكم، ولا تصلكما اقتراحات لبعضكما.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : blocks.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/20">
          <CardContent className="py-14 text-center space-y-3">
            <UserX className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-semibold text-foreground">لا يوجد أشخاص محظورون</p>
            <p className="text-sm text-muted-foreground">يمكنك حظر أي شخص من قائمة الخيارات في بطاقة التوافق.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{b.blocked.firstName}</p>
                  <p className="text-xs text-muted-foreground">
                    حُظر بتاريخ {new Date(b.createdAt).toLocaleDateString("ar-JO-u-nu-latn")}
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
