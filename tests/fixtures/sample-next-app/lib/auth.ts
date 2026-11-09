import { cookies } from "next/headers";
import { db } from "@/lib/db";

export type SessionUser = { id: string; email: string; name: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieName = process.env.SESSION_COOKIE ?? "sl_session";
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const membership = await db.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  return membership !== null;
}
