import { getEmployees, getTags, getTemplates } from "@/lib/queries";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SettingsContent } from "./settings-content";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const employees = await getEmployees();
  const tags = await getTags();
  const templates = await getTemplates();

  return <SettingsContent employees={employees} tags={tags} templates={templates} currentUserRole={session?.user?.role ?? "associate"} />;
}
