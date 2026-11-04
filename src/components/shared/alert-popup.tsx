"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MemberAlert } from "@/lib/alerts";

async function fetchAlert(): Promise<MemberAlert | null> {
  const res = await fetch("/api/alerts/current?platform=web").catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data?.alert ?? null;
}

/**
 * The admin's popup alert (src/lib/alerts.ts) on the website dashboard: the oldest one waiting, once. Closing it or
 * tapping its button records that, so it never shows again (in the app either); then the next one, if any.
 */
export function AlertPopup() {
  const router = useRouter();
  const [alert, setAlert] = useState<MemberAlert | null>(null);

  useEffect(() => {
    let gone = false;
    fetchAlert().then((a) => !gone && setAlert(a));
    return () => {
      gone = true;
    };
  }, []);

  async function close(openLink: boolean) {
    const current = alert;
    if (!current) return;
    setAlert(null);
    await fetch(`/api/alerts/${current.id}/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // For the admin's counts: its button, or closed
      body: JSON.stringify({ action: openLink && current.buttonUrl ? "TAPPED" : "CLOSED" }),
    }).catch(() => {});
    if (openLink && current.buttonUrl) {
      if (current.buttonUrl.startsWith("/")) router.push(current.buttonUrl);
      else window.open(current.buttonUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setAlert(await fetchAlert());
  }

  return (
    <Dialog open={!!alert} onOpenChange={(open) => !open && close(false)}>
      <DialogContent dir="rtl" className="max-w-sm text-center">
        {alert?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={alert.imageUrl} alt="" className="mx-auto max-h-48 w-full rounded-xl object-cover" />
        )}
        <DialogTitle className="text-center text-lg">{alert?.title}</DialogTitle>
        <DialogDescription className="whitespace-pre-line text-center text-sm leading-relaxed">
          {alert?.body}
        </DialogDescription>
        <div className="flex flex-col gap-2 pt-1">
          {alert?.buttonUrl && alert.buttonLabel && <Button onClick={() => close(true)}>{alert.buttonLabel}</Button>}
          <Button variant="ghost" onClick={() => close(false)}>
            {alert?.buttonUrl ? "لاحقاً" : "حسناً"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
