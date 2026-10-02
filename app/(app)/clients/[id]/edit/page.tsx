import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { getClient, getEmployees } from "@/lib/queries";
import { EditClientForm } from "./edit-client-form";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession();
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const isManager = session.user.role === "manager";
  if (!isManager && client.employeeId !== session.user.id) notFound();

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
      clientId={id}
      employees={employees}
    />
  );
}
