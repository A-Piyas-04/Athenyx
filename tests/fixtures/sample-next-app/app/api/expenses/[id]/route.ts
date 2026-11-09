import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const expense = await db.expense.findUnique({
    where: { id },
    include: { shares: true, paidBy: { select: { id: true, name: true } } },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(expense);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const expense = await db.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.expense.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
