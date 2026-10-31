"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setStoreName } from "@/lib/actions/store";
import { STORE_NAME_MAX } from "@/lib/constants";

/** The store-name field and its Save button. */
export function StoreNameForm({ current, id = "storeName" }: { current: string | null; id?: string }) {
  const router = useRouter();
  const [name, setName] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const unchanged = name.trim() === (current ?? "");

  async function save() {
    setSaving(true);
    try {
      const res = await setStoreName(name);
      if (res?.error) { toast.error(res.error); return; }
      toast.success("Store name saved");
      router.refresh();
    } catch {
      toast.error("Couldn't save the store name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Field className="flex-1 sm:max-w-md">
        <FieldLabel htmlFor={id}>Store name</FieldLabel>
        <Input id={id} value={name} maxLength={STORE_NAME_MAX} placeholder="e.g. Harbor Street Optics" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" disabled={saving || !name.trim() || unchanged}>{saving ? "Saving…" : "Save"}</Button>
    </form>
  );
}

/** Settings → Store. */
export function StoreTab({ storeName }: { storeName: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Store</CardTitle>
        <CardDescription>Your store&apos;s name shows in the sidebar and the browser tab for everyone on the team.</CardDescription>
      </CardHeader>
      <CardContent>
        <StoreNameForm current={storeName} />
      </CardContent>
    </Card>
  );
}

/** Dashboard card a manager sees until the store has a name. */
export function StoreNamePrompt() {
  return (
    <Card className="border-iris-gold/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Store className="size-4 text-iris-gold-deep dark:text-iris-gold" />Name your store</CardTitle>
        <CardDescription>It shows in the sidebar and the browser tab for everyone on the team. You can change it later in Settings → Store.</CardDescription>
      </CardHeader>
      <CardContent>
        <StoreNameForm current={null} id="storeNamePrompt" />
      </CardContent>
    </Card>
  );
}
