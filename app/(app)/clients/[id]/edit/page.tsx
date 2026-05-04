import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient, getEmployees } from "@/lib/queries";
import { EditClientForm } from "./edit-client-form";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const client = await getClient(params.id);
  if (!client) notFound();

  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";

  const employees = isManager
    ? (await getEmployees()).map((e) => ({
        id: e.id,
        name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
        role: e.role,
      }))
    : undefined;

  return (
    <EditClientForm
      initialClient={JSON.parse(JSON.stringify(client))}
      clientId={params.id}
      employees={employees}
    />
  );
}
