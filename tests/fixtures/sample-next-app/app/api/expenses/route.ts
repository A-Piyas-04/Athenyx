import { NextResponse } from "next/server";
import { getSessionUser, isGroupMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { splitEvenly } from "@/lib/split";

type CreateExpenseBody = { groupId: string; description: string; amount: number };

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as CreateExpenseBody;
  if (!body.groupId || !body.description || !(body.amount > 0)) {
    return NextResponse.json({ error: "Invalid expense" }, { status: 400 });
  }
  if (!(await isGroupMember(user.id, body.groupId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const members = await db.membership.findMany({ where: { groupId: body.groupId } });
  const shares = splitEvenly(
    body.amount,
    members.map((m) => m.userId),
  );

  const expense = await db.expense.create({
    data: {
      groupId: body.groupId,
      paidById: user.id,
      description: body.description,
      amount: body.amount,
      shares: { create: shares },
    },
    include: { shares: true },
  });
  return NextResponse.json(expense, { status: 201 });
}
