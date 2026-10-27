"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BarChart3, Check, Copy, Loader2, MessageCircleQuestion, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fmtDate } from "@/components/admin/admin-list-bits";
import {
  MIN_POLL_RESULTS,
  POLL_NOTE_MAX,
  POLL_OPTION_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POLL_QUESTION_MAX,
  percentsOf,
  pollShareUrl,
  type PollOption,
  type PollStatusValue,
} from "@/lib/engagement/poll-types";
import type { OptionBreakdown } from "@/lib/engagement/poll-admin";

interface PollRow {
  id: string;
  slug: string;
  question: string;
  options: PollOption[];
  note: string | null;
  status: PollStatusValue;
  startedAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  createdAt: string;
  votes: number;
}

const STATUS_STYLE: Record<PollStatusValue, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-primary/10 text-primary",
};

const noSubscribe = () => () => {};

const emptyForm = { question: "", options: ["", ""], note: "" };

export default function AdminPollsPage() {
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [roundDays, setRoundDays] = useState("3");
  const [reward, setReward] = useState("1");
  const [creditsGiven, setCreditsGiven] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ options: OptionBreakdown[]; testVotes: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/polls");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed to load (${res.status})`);
        return;
      }
      setError("");
      setPolls(data.polls || []);
      setEnabled(!!data.enabled);
      setRoundDays(String(data.roundDays ?? 3));
      setReward(String(data.rewardCredits ?? 1));
      setCreditsGiven(data.creditsGiven ?? 0);
    } catch {
      setError("Network error, please reload");
    } finally {
      setLoading(false);
    }
  }

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return null;
      }
      return data;
    } catch {
      setError("Network error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function toggle(next: boolean) {
    const data = await call("switch", "/api/admin/polls/switch", { method: "PATCH", body: JSON.stringify({ enabled: next }) });
    if (data) setEnabled(data.enabled);
  }

  async function saveSettings() {
    const body = { roundDays: Number(roundDays), rewardCredits: Number(reward) };
    if (await call("settings", "/api/admin/polls/switch", { method: "PATCH", body: JSON.stringify(body) })) load();
  }

  async function save() {
    const body = { question: form.question, options: form.options.filter((o) => o.trim()), note: form.note };
    const data = editing
      ? await call("save", `/api/admin/polls/${editing}`, { method: "PATCH", body: JSON.stringify({ action: "edit", poll: body }) })
      : await call("save", "/api/admin/polls", { method: "POST", body: JSON.stringify(body) });
    if (data) {
      setForm(emptyForm);
      setEditing(null);
      load();
    }
  }

  async function act(id: string, action: "activate" | "close") {
    if (action === "activate" && polls.some((p) => p.status === "ACTIVE" && p.id !== id) && !confirmClose()) return;
    if (await call(id, `/api/admin/polls/${id}`, { method: "PATCH", body: JSON.stringify({ action }) })) load();
  }

  function confirmClose() {
    return window.confirm("Activating this question closes the one running now. Continue?");
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this question? This can't be undone.")) return;
    if (await call(id, `/api/admin/polls/${id}`, { method: "DELETE" })) load();
  }

  async function showResults(id: string) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    setDetail(null);
    const data = await call(`r-${id}`, `/api/admin/polls/${id}`, { method: "GET" });
    if (data) setDetail({ options: data.options, testVotes: data.testVotes });
  }

  function edit(p: PollRow) {
    setEditing(p.id);
    setForm({ question: p.question, options: p.options.map((o) => o.label), note: p.note ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const active = polls.find((p) => p.status === "ACTIVE");
  // Queue order = oldest draft first (the list itself is newest first)
  const queue = polls.filter((p) => p.status === "DRAFT").map((p) => ({ id: p.id, at: p.createdAt })).sort((a, b) => a.at.localeCompare(b.at)).map((p) => p.id);
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const shareLink = origin ? pollShareUrl(origin) : "";

  async function copyLink() {
    await navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircleQuestion className="h-6 w-6 text-primary" /> Naseebak Question <span dir="rtl" className="text-base font-medium text-muted-foreground">(سؤال نصيبك)</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            One question on Instagram, the public page /poll and the members&apos; dashboard. A new one from the queue every {roundDays} days. Results show from {MIN_POLL_RESULTS} votes.
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
          Show to visitors and members
          <Switch checked={enabled} disabled={busy === "switch"} onCheckedChange={toggle} />
        </label>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="days">Days per question</Label>
            <Input id="days" type="number" min={1} max={30} className="w-28" value={roundDays} onChange={(e) => setRoundDays(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reward">Credits per answer (members, 0 = off)</Label>
            <Input id="reward" type="number" min={0} max={5} className="w-28" value={reward} onChange={(e) => setReward(e.target.value)} />
          </div>
          <Button variant="outline" onClick={saveSettings} disabled={busy === "settings"}>
            {busy === "settings" && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
          </Button>
          <p className="text-xs text-muted-foreground">
            Credits given for answers so far: <span className="font-semibold text-foreground">{creditsGiven}</span>. Members only, once per question; visitors never see credits.
          </p>
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">Instagram link for the story sticker / bio (always opens the running question)</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" dir="ltr">
                {shareLink}
              </code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {!enabled && <p className="text-xs text-amber-700">The switch is off: the link shows «not found» until you turn it on.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-semibold">{editing ? "Edit question" : "New question"}</h2>
          {!editing && <p className="text-xs text-muted-foreground">Queued questions go live on their own, oldest first, when the running one has had its {roundDays} days.</p>}
          <div className="space-y-1">
            <Label htmlFor="q">Question (Arabic)</Label>
            <Input id="q" dir="rtl" maxLength={POLL_QUESTION_MAX} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="برأيك، التعارف الأحسن يبدأ…" />
          </div>
          <div className="space-y-2">
            <Label>
              Options ({POLL_OPTIONS_MIN}–{POLL_OPTIONS_MAX})
            </Label>
            {form.options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  dir="rtl"
                  maxLength={POLL_OPTION_MAX}
                  value={o}
                  onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? e.target.value : x)) })}
                  placeholder={`Option ${i + 1}`}
                />
                {form.options.length > POLL_OPTIONS_MIN && (
                  <Button variant="ghost" size="icon" aria-label="Remove option" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {form.options.length < POLL_OPTIONS_MAX && (
              <Button variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                <Plus className="h-4 w-4" /> Add option
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="note">Line shown after voting (optional, Arabic)</Label>
            <Input id="note" dir="rtl" maxLength={POLL_NOTE_MAX} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="على نصيبك إنت بتختار: محادثة محمية أو تعارف عائلي." />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy === "save"}>
              {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Add to queue"}
            </Button>
            {editing && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      ) : polls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <div className="space-y-3">
          {polls.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p dir="rtl" className="text-right font-semibold">
                      {p.question}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      /poll/{p.slug} · created {fmtDate(p.createdAt)}
                      {p.startedAt && ` · started ${fmtDate(p.startedAt)}`}
                      {p.status === "ACTIVE" && p.endsAt && ` · next question ${fmtDate(p.endsAt)}`}
                      {p.closedAt && ` · closed ${fmtDate(p.closedAt)}`}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLE[p.status]}>{p.status === "DRAFT" ? (queue.indexOf(p.id) === 0 ? "NEXT" : `QUEUE #${queue.indexOf(p.id) + 1}`) : p.status}</Badge>
                  <Badge variant="outline">{p.votes} votes</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.status !== "ACTIVE" && (
                    <Button size="sm" onClick={() => act(p.id, "activate")} disabled={busy === p.id}>
                      <Play className="h-4 w-4" /> {p.status === "CLOSED" ? "Reopen" : "Start now"}
                    </Button>
                  )}
                  {p.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => act(p.id, "close")} disabled={busy === p.id}>
                      <Square className="h-4 w-4" /> Close
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => showResults(p.id)}>
                    <BarChart3 className="h-4 w-4" /> Results
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => edit(p)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  {p.votes === 0 && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(p.id)} disabled={busy === p.id}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  )}
                </div>
                {open === p.id && (
                  <div className="overflow-x-auto rounded-md border">
                    {!detail ? (
                      <Loader2 className="m-4 h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Results detail={detail} pollId={p.id} />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Results({ detail, pollId }: { detail: { options: OptionBreakdown[]; testVotes: number }; pollId: string }) {
  const ids = detail.options.map((o) => o.id);
  const total = detail.options.reduce((s, o) => s + o.total, 0);
  const pct = percentsOf(Object.fromEntries(detail.options.map((o) => [o.id, o.total])), ids);
  return (
    <div className="space-y-3 p-3">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-1.5 pr-2 text-right">Option</th>
            <th className="px-2">Votes</th>
            <th className="px-2">%</th>
            <th className="hidden px-2 md:table-cell">Members</th>
            <th className="hidden px-2 md:table-cell">Visitors</th>
            <th className="px-2">Women</th>
            <th className="px-2">Men</th>
            <th className="hidden px-2 md:table-cell">Instagram</th>
            <th className="hidden px-2 md:table-cell">Dashboard</th>
          </tr>
        </thead>
        <tbody>
          {detail.options.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td dir="rtl" className="py-1.5 pr-2 text-right font-medium">
                {o.label}
              </td>
              <td className="px-2">{o.total}</td>
              <td className="px-2 font-semibold">{pct[o.id]}%</td>
              <td className="hidden px-2 md:table-cell">{o.members}</td>
              <td className="hidden px-2 md:table-cell">{o.visitors}</td>
              <td className="px-2">{o.women}</td>
              <td className="px-2">{o.men}</td>
              <td className="hidden px-2 md:table-cell">{o.instagram}</td>
              <td className="hidden px-2 md:table-cell">{o.dashboard}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total} counted votes{detail.testVotes > 0 && ` · ${detail.testVotes} from test accounts (not counted)`}
          {total < MIN_POLL_RESULTS && ` · under ${MIN_POLL_RESULTS}: voters don't see results yet`}
        </span>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/polls/${pollId}/story`}>Results story (1080×1920)</Link>
        </Button>
      </div>
    </div>
  );
}
