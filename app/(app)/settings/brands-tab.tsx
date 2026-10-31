"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Award, Plus, Trash2, MoreHorizontal, Pencil } from "lucide-react";
import { createBrand, renameBrand, deleteBrand, type BrandRow } from "@/lib/actions";
import { toast } from "sonner";

const inUse = (b: BrandRow) => b.catalogCount + b.promoCount + b.clientCount > 0;

/** Settings → Brands: the store's brand list (managers only). */
export function SettingsBrandsTab({ brands }: { brands: BrandRow[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<BrandRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BrandRow | null>(null);

  const run = async (fn: () => Promise<{ error: string } | undefined>, ok: string) => {
    try {
      const res = await fn();
      if (res?.error) { toast.error(res.error); return false; }
      toast.success(ok);
      router.refresh();
      return true;
    } catch {
      toast.error("Something went wrong");
      return false;
    }
  };

  const handleAdd = async () => {
    if (await run(() => createBrand(newName), "Brand added")) { setAddOpen(false); setNewName(""); }
  };
  const handleRename = async () => {
    if (!renameTarget) return;
    if (await run(() => renameBrand(renameTarget.id, renameValue), "Brand renamed")) setRenameTarget(null);
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (await run(() => deleteBrand(deleteTarget.id), "Brand removed")) setDeleteTarget(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Brands</CardTitle>
              <CardDescription>
                The brands your store carries. They appear in every brand picker, and imports
                match brand names against this list.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4 mr-2" />Add Brand
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <EmptyState icon={Award} title="No brands yet" description="Add the brands your store carries — or import your catalog or a promo sheet, and Iris offers to add the brands it finds" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Catalog models</TableHead>
                    <TableHead className="text-right">Promos</TableHead>
                    <TableHead className="text-right">Clients</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.catalogCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.promoCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.clientCount}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0" aria-label={`Actions for ${b.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => { setRenameTarget(b); setRenameValue(b.name); }}>
                              <Pencil className="size-4 mr-2" />Rename
                            </DropdownMenuItem>
                            {inUse(b) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <DropdownMenuItem disabled>
                                      <Trash2 className="size-4 mr-2" />Remove
                                    </DropdownMenuItem>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left">Still in use — change those models, promos and clients first</TooltipContent>
                              </Tooltip>
                            ) : (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(b)}>
                                <Trash2 className="size-4 mr-2" />Remove
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Brand</DialogTitle>
            <DialogDescription>Add a brand your store carries.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="brandName">Brand name</FieldLabel>
            <Input id="brandName" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          </Field>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newName.trim()}>Add Brand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Brand</DialogTitle>
            <DialogDescription>
              Renames <strong>{renameTarget?.name}</strong> on every catalog model, promo and client that uses it.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="renameBrand">New name</FieldLabel>
            <Input id="renameBrand" value={renameValue} autoFocus onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRename()} />
          </Field>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim() || renameValue.trim() === renameTarget?.name}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title="Remove Brand"
        description={<>Remove <strong>{deleteTarget?.name}</strong> from the brand list? Nothing uses it.</>}
        confirmLabel="Remove"
        onConfirmAction={handleDelete}
        variant="destructive"
      />
    </>
  );
}
