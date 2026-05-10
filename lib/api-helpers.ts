import { getServerSession, type Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

type AuthedHandler<Args extends unknown[]> = (session: Session, ...args: Args) => Promise<Response>;

export function withAuth<Args extends unknown[]>(
  handler: AuthedHandler<Args>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return handler(session, ...args);
  };
}

export function withManagerAuth<Args extends unknown[]>(
  handler: AuthedHandler<Args>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (session.user.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return handler(session, ...args);
  };
}
