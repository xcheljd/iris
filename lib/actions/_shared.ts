"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user;
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireManager() {
  const user = await requireAuth();
  if (user.role !== "manager") throw new Error("Manager access required");
  return user;
}
