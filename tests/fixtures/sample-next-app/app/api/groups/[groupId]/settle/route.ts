import { NextResponse } from "next/server";
import { getSessionUser, isGroupMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPayment } from "@/lib/payments";
import { settleUp } from "@/lib/settle";

type Params = { params: Promise<{ groupId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  if (!(await isGroupMember(user.id, groupId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { members: { include: { user: true } }, expenses: { include: { shares: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const members = group.members.map((m) => ({ id: m.user.id, name: m.user.name }));
  const transfers = settleUp(members, group.expenses).filter((t) => t.fromUserId === user.id);

  const payments = [];
  for (const transfer of transfers) {
    const result = await createPayment(transfer);
    payments.push(
      await db.payment.create({
        data: { groupId, ...transfer, externalId: result.externalId },
      }),
    );
  }
  return NextResponse.json({ payments });
}
