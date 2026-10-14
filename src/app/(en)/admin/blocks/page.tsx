"use client";

import { useState, useEffect } from "react";
import { Ban, Loader2, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BlockRow {
  id: string;
  createdAt: string;
  blocker: { id: string; firstName: string; lastName: string; phone: string | null };
  blocked: { id: string; firstName: string; lastName: string; phone: string | null };
}

export default function AdminBlocksPage() {
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blocks?page=${page}`);
      const data = await res.json();
      setBlocks(data.blocks || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]);

  async function handleRemove(blockId: string) {
    if (!confirm("Remove this block? Both users will be able to see each other again.")) return;
    setRemoving(blockId);
    try {
      const res = await fetch(`/api/admin/blocks/${blockId}`, { method: "DELETE" });
      if (res.ok) {
        setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Ban className="h-7 w-7 text-primary" />
          Block Management
        </h1>
        <p className="text-muted-foreground mt-1">View and manage user blocks</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">Blocker</th>
                  <th className="text-left p-3 text-sm font-medium">Blocked User</th>
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={4} className="p-3">
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : blocks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-8 text-muted-foreground">
                      No blocks found
                    </td>
                  </tr>
                ) : (
                  blocks.map((block) => (
                    <tr key={block.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-sm">{block.blocker.firstName} {block.blocker.lastName}</p>
                        <p className="text-xs text-muted-foreground">{block.blocker.phone || "—"}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-sm">{block.blocked.firstName} {block.blocked.lastName}</p>
                        <p className="text-xs text-muted-foreground">{block.blocked.phone || "—"}</p>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(block.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemove(block.id)}
                          disabled={removing === block.id}
                        >
                          {removing === block.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <><Trash2 className="h-3 w-3 me-1" />Remove</>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
