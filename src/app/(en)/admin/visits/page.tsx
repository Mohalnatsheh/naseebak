"use client";

import { useState, useEffect } from "react";
import { CalendarHeart, Loader2, Phone, MapPin, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Visit {
  id: string;
  status: string;
  scheduledDate: string | null;
  location: string | null;
  adminNotes: string | null;
  createdAt: string;
  match: {
    female: { firstName: string; lastName: string; parentInfo: { parentName: string; parentPhone: string } | null };
    male: { firstName: string; lastName: string; parentInfo: { parentName: string; parentPhone: string } | null };
  };
}

const statusOptions = [
  { value: "REQUESTED", label: "Requested", color: "bg-amber-100 text-amber-800" },
  { value: "FAMILIES_CONTACTED", label: "Families Contacted", color: "bg-blue-100 text-blue-800" },
  { value: "SCHEDULED", label: "Scheduled", color: "bg-green-100 text-green-800" },
  { value: "COMPLETED", label: "Completed", color: "bg-emerald-100 text-emerald-800" },
  { value: "CANCELLED", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

export default function AdminVisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [editValues, setEditValues] = useState<Record<string, { date: string; location: string; notes: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchVisits();
  }, []);

  async function fetchVisits() {
    try {
      const res = await fetch("/api/admin/visits");
      const data = await res.json();
      setVisits(data.visits || []);
      // Initialize edit values
      const initVals: Record<string, { date: string; location: string; notes: string }> = {};
      for (const v of (data.visits || [])) {
        initVals[v.id] = {
          date: v.scheduledDate ? new Date(v.scheduledDate).toISOString().slice(0, 16) : "",
          location: v.location || "",
          notes: v.adminNotes || "",
        };
      }
      setEditValues(initVals);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function updateVisitStatus(visitId: string, status: string) {
    setUpdating(visitId);
    try {
      await fetch("/api/admin/visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, status }),
      });
      await fetchVisits();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(null);
    }
  }

  async function saveDetails(visitId: string) {
    const vals = editValues[visitId];
    if (!vals) return;
    setSaving(visitId);
    try {
      await fetch("/api/admin/visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId,
          status: visits.find((v) => v.id === visitId)?.status,
          scheduledDate: vals.date || undefined,
          location: vals.location || undefined,
          adminNotes: vals.notes || undefined,
        }),
      });
      await fetchVisits();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  const filtered = statusFilter
    ? visits.filter((v) => v.status === statusFilter)
    : visits;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <CalendarHeart className="h-7 w-7 text-primary" />
          Visit Request Management
        </h1>
        <p className="text-muted-foreground mt-1">Coordinate family visits for mutual matches</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={statusFilter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("")}
        >
          All ({visits.length})
        </Button>
        {statusOptions.map((opt) => {
          const count = visits.filter((v) => v.status === opt.value).length;
          return (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label} ({count})
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CalendarHeart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-lg">No Visit Requests</h3>
            <p className="text-sm text-muted-foreground">
              {statusFilter ? `No visits with status "${statusFilter}"` : "Visit requests will appear here when mutual matches are made."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((v) => {
            const currentStatus = statusOptions.find((s) => s.value === v.status);
            const vals = editValues[v.id] || { date: "", location: "", notes: "" };
            return (
              <Card key={v.id}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">
                        {v.match.female.firstName} {v.match.female.lastName} & {v.match.male.firstName} {v.match.male.lastName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(v.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={currentStatus?.color || ""}>
                      {currentStatus?.label || v.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="font-medium">Female&apos;s Family</p>
                      {v.match.female.parentInfo ? (
                        <div className="text-muted-foreground space-y-0.5">
                          <p>{v.match.female.parentInfo.parentName}</p>
                          <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{v.match.female.parentInfo.parentPhone}</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No parent info</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Male&apos;s Family</p>
                      {v.match.male.parentInfo ? (
                        <div className="text-muted-foreground space-y-0.5">
                          <p>{v.match.male.parentInfo.parentName}</p>
                          <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{v.match.male.parentInfo.parentPhone}</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No parent info</p>
                      )}
                    </div>
                  </div>

                  {/* Details inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Scheduled Date</Label>
                      <Input
                        type="datetime-local"
                        value={vals.date}
                        onChange={(e) => setEditValues((prev) => ({
                          ...prev,
                          [v.id]: { ...prev[v.id], date: e.target.value },
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Location</Label>
                      <Input
                        placeholder="Visit location..."
                        value={vals.location}
                        onChange={(e) => setEditValues((prev) => ({
                          ...prev,
                          [v.id]: { ...prev[v.id], location: e.target.value },
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Admin Notes</Label>
                      <Input
                        placeholder="Notes..."
                        value={vals.notes}
                        onChange={(e) => setEditValues((prev) => ({
                          ...prev,
                          [v.id]: { ...prev[v.id], notes: e.target.value },
                        }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveDetails(v.id)}
                      disabled={saving === v.id}
                    >
                      {saving === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Save className="h-3 w-3 me-1" />Save Details</>}
                    </Button>
                    <div className="h-4 w-px bg-border" />
                    {statusOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        variant={v.status === opt.value ? "default" : "outline"}
                        size="sm"
                        disabled={updating === v.id}
                        onClick={() => updateVisitStatus(v.id, opt.value)}
                      >
                        {updating === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : opt.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
