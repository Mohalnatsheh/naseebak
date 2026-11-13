"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOutAndUnlinkPush } from "@/lib/push-client";

/**
 * Asks before signing out (website, behind `dashboard_redesign`). Sign-out ends every browser session
 * of the member (WA-01) but not the phone app, and the text says so.
 */
export function SignOutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    setBusy(true);
    // A failed sign-out (offline) gives the button back instead of a spinner that never ends
    signOutAndUnlinkPush("/login").catch(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent dir="rtl" className="sm:max-w-md text-right">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>تسجيل الخروج؟</DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            سيتم تسجيل خروجك من هذا المتصفح ومن كل المتصفحات الأخرى. التطبيق على هاتفك لا يتأثر.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button type="button" variant="destructive" className="h-11 flex-1 rounded-xl sm:flex-none" disabled={busy} onClick={confirm}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            تسجيل الخروج
          </Button>
          <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl sm:flex-none" disabled={busy} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
