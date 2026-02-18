"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, FileText, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface IdentityDoc {
  id: string;
  documentType: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    gender: string;
  };
}

export default function AdminIdentityPage() {
  const [docs, setDocs] = useState<IdentityDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDocs();
  }, []);

  async function fetchDocs() {
    try {
      const res = await fetch("/api/admin/identity");
      const data = await res.json();
      setDocs(data.docs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(docId: string, action: "approve" | "reject") {
    setActing(docId);
    try {
      const res = await fetch("/api/admin/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, action, reviewNotes: notes[docId] || "" }),
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Identity Verification Queue
        </h1>
        <p className="text-muted-foreground mt-1">
          Review and approve pending identity documents
          {docs.length > 0 && <Badge className="ms-2">{docs.length} pending</Badge>}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <h3 className="font-medium text-lg">All Clear!</h3>
            <p className="text-sm text-muted-foreground">No pending identity verifications.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{doc.user.firstName} {doc.user.lastName}</h3>
                      <p className="text-sm text-muted-foreground">{doc.user.email}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {doc.user.gender === "MALE" ? "Male" : "Female"}
                        </Badge>
                        <Badge variant="outline" className="text-xs gap-1">
                          <FileText className="h-3 w-3" />
                          {doc.documentType === "national_id" ? "National ID" : "Passport"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="space-y-3">
                  <Input
                    placeholder="Review notes (optional)..."
                    value={notes[doc.id] || ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAction(doc.id, "approve")}
                      disabled={acting === doc.id}
                      className="flex-1"
                    >
                      {acting === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 me-2" />
                          Approve
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleAction(doc.id, "reject")}
                      disabled={acting === doc.id}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 me-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
