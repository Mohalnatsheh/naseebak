"use client";

import { useEffect, useState } from "react";
import { Loader2, HeartHandshake, MessageCircle, Info, TriangleAlert, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface State {
  introRequests: boolean;
  chat: boolean;
  mutualSuggestions: boolean;
  creditsMigratedAt: string | null;
}

type Key = "introRequests" | "chat" | "mutualSuggestions";

/** Admin → Settings: the switches for the new user cycle, in plain words. */
export function NewCycleSettingsCard() {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState<null | Key>(null);
  const [confirmOff, setConfirmOff] = useState<null | Key>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings/new-cycle")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => setError("Couldn't load settings"));
  }, []);

  async function save(key: Key, value: boolean) {
    setSaving(key);
    setError("");
    const res = await fetch("/api/admin/settings/new-cycle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => null);
    if (res?.ok) setState(await res.json());
    else setError("Couldn't save. Try again.");
    setSaving(null);
  }

  function toggle(key: Key, value: boolean) {
    if (!value) setConfirmOff(key);
    else save(key, true);
  }

  const rows = [
    {
      key: "introRequests" as const,
      icon: HeartHandshake,
      title: "Family and chat requests",
      text: "Matches show two buttons: family introduction (shares guardian contacts) and chat request. Suggestions become free (3 per week); each request costs the sender 1 credit. New matches no longer create visit requests for admins.",
      on: state?.introRequests ?? false,
      disabled: false,
    },
    {
      key: "chat" as const,
      icon: MessageCircle,
      title: "In-app chat",
      text: "Matched users who accept a chat request can message each other for 14 days. Phone numbers, links and social accounts are blocked automatically.",
      on: state?.chat ?? false,
      disabled: !state?.introRequests,
    },
    {
      key: "mutualSuggestions" as const,
      icon: Users,
      title: "Simultaneous suggestions",
      text: "Both people see the same suggestion and each taps Interested or No. A match happens only when both say yes; nobody learns the other's answer. Dealbreakers become hard filters and every card says why it was suggested. Suggestions already in progress keep working.",
      on: state?.mutualSuggestions ?? false,
      disabled: !state?.introRequests,
    },
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          New user cycle
          {state && (
            <Badge variant={state.introRequests ? "default" : "secondary"}>{state.introRequests ? "On" : "Off"}</Badge>
          )}
        </CardTitle>
        <CardDescription>Users connect with each other without admin work. Changes apply within 30 seconds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          rows.map((r) => (
            <div key={r.key} className="flex items-start gap-4 rounded-xl border border-border/60 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <r.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-sm">{r.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>
                {r.disabled && <p className="text-xs font-medium text-amber-700">Turn on family and chat requests first.</p>}
              </div>
              <div className="flex items-center gap-2 pt-1">
                {saving === r.key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  checked={r.on}
                  disabled={r.disabled || saving !== null}
                  onCheckedChange={(v) => toggle(r.key, v)}
                  aria-label={r.title}
                />
              </div>
            </div>
          ))
        )}

        {state?.introRequests && !state.creditsMigratedAt && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              One step left: run <code className="rounded bg-amber-100 px-1">node scripts/new-cycle-migrate.mjs</code> on the
              server once. It tops every user up to 3 credits and tells them about the new rules.
            </p>
          </div>
        )}
        {state?.creditsMigratedAt && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Credits were topped up on {new Date(state.creditsMigratedAt).toLocaleString()}.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>

      <Dialog open={!!confirmOff} onOpenChange={(o) => !o && setConfirmOff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmOff === "chat"
                ? "Turn off chat?"
                : confirmOff === "mutualSuggestions"
                  ? "Turn off simultaneous suggestions?"
                  : "Turn off family and chat requests?"}</DialogTitle>
            <DialogDescription>
              {confirmOff === "chat"
                ? "Users won't be able to send new messages or chat requests. Existing chats stay readable."
                : confirmOff === "mutualSuggestions"
                  ? "New suggestions go back to the old one-by-one flow. Users can still answer the simultaneous suggestions they already have."
                  : "Users won't be able to send new requests, and suggestions go back to costing credits. Accepted introductions and existing chats stay visible. Chat pauses too."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const key = confirmOff!;
                setConfirmOff(null);
                save(key, false);
              }}
            >
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
