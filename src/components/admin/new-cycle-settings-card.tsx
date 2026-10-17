"use client";

import { useEffect, useState } from "react";
import { Loader2, HeartHandshake, MessageCircle, Info, TriangleAlert, Users, Coins } from "lucide-react";
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
  creditOnInterest: boolean;
  creditsMigratedAt: string | null;
}

type Key = "introRequests" | "chat" | "mutualSuggestions" | "creditOnInterest";

/** Admin → Settings: the switches for the new user cycle, in plain words. */
export function NewCycleSettingsCard() {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState<null | Key>(null);
  const [confirmOff, setConfirmOff] = useState<null | Key>(null);
  const [confirmIntroOn, setConfirmIntroOn] = useState(false);
  const [migration, setMigration] = useState<null | { users: number; toppedUp: number }>(null);
  const [migrating, setMigrating] = useState(false);
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
    else if (key === "introRequests") setConfirmIntroOn(true);
    else save(key, true);
  }

  async function openMigration() {
    setError("");
    const res = await fetch("/api/admin/settings/new-cycle/migrate").catch(() => null);
    if (res?.ok) setMigration(await res.json());
    else setError("Couldn't count the users to top up.");
  }

  async function runMigration() {
    setMigrating(true);
    setError("");
    const res = await fetch("/api/admin/settings/new-cycle/migrate", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok || data.reason === "ALREADY_DONE") {
      setState((s) => (s ? { ...s, creditsMigratedAt: data.at ?? new Date().toISOString() } : s));
    } else {
      setError(data.error || "Couldn't run the top-up. Try again.");
    }
    setMigration(null);
    setMigrating(false);
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
      on: !!state?.introRequests && !!state?.chat,
      disabled: !state?.introRequests,
    },
    {
      key: "mutualSuggestions" as const,
      icon: Users,
      title: "Simultaneous suggestions",
      text: "Both people see the same suggestion and each taps Interested or No. A match happens only when both say yes; nobody learns the other's answer. Dealbreakers become hard filters and every card says why it was suggested. Suggestions already in progress keep working.",
      on: !!state?.introRequests && !!state?.mutualSuggestions,
      disabled: !state?.introRequests,
    },
    {
      key: "creditOnInterest" as const,
      icon: Coins,
      title: "Credit on interest",
      text: "Suggestions are free (5 open at a time, score ≥ 50, best first). Each 'Interested' costs the user 1 credit (refunded if the other side never answers within 7 days); matches, requests and chat are free. A mutual match opens straight into chat or family introduction. Turning it on closes older-style suggestions still waiting for a decision. Needs Shared suggestions on.",
      on: !!state?.introRequests && !!state?.mutualSuggestions && !!state?.creditOnInterest,
      disabled: !state?.introRequests || !state?.mutualSuggestions,
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
                {r.disabled && (
                  <p className="text-xs font-medium text-amber-700">
                    {r.key === "creditOnInterest" ? "Turn on simultaneous suggestions first." : "Turn on family and chat requests first."}
                  </p>
                )}
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
            <div className="space-y-2">
              <p>
                One step left: top every user up to 3 credits and tell them about the new rules. Runs once — a second
                click changes nothing.
              </p>
              <Button size="sm" variant="outline" onClick={openMigration} disabled={migrating}>
                Run credit top-up…
              </Button>
            </div>
          </div>
        )}
        {state?.creditsMigratedAt && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Credits were topped up on {new Date(state.creditsMigratedAt).toLocaleString()}.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>

      <Dialog open={confirmIntroOn} onOpenChange={setConfirmIntroOn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn on family and chat requests?</DialogTitle>
            <DialogDescription>
              Suggestions become free (3 per week) and each family or chat request costs the sender 1 credit, never
              refunded. New matches stop creating visit requests for admins. Afterwards, run the one-time credit top-up
              from this card.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmIntroOn(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setConfirmIntroOn(false);
                save("introRequests", true);
              }}
            >
              Turn on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!migration} onOpenChange={(o) => !o && setMigration(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run the credit top-up?</DialogTitle>
            <DialogDescription>
              {migration
                ? `${migration.toppedUp} of ${migration.users} users have fewer than 3 credits and will be topped up to 3. Every user gets a notification about the new credit rules. This runs only once.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMigration(null)}>Cancel</Button>
            <Button onClick={runMigration} disabled={migrating}>
              {migrating && <Loader2 className="h-4 w-4 animate-spin me-2" />}Top up and notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmOff} onOpenChange={(o) => !o && setConfirmOff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmOff === "chat"
                ? "Turn off chat?"
                : confirmOff === "mutualSuggestions"
                  ? "Turn off simultaneous suggestions?"
                  : confirmOff === "creditOnInterest"
                  ? "Turn off credit on interest?"
                  : "Turn off family and chat requests?"}</DialogTitle>
            <DialogDescription>
              {confirmOff === "chat"
                ? "Users won't be able to send new messages or chat requests. Existing chats stay readable."
                : confirmOff === "mutualSuggestions"
                  ? "New suggestions go back to the old one-by-one flow. Users can still answer the simultaneous suggestions they already have."
                  : confirmOff === "creditOnInterest"
                  ? "'Interested' becomes free again and family and chat requests cost 1 credit again. Open chats and accepted introductions keep working."
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
