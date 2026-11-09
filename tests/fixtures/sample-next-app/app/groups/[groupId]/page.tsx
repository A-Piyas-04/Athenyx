import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/ExpenseForm";
import { getSessionUser, isGroupMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { computeBalances } from "@/lib/settle";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const user = await getSessionUser();
  if (!user || !(await isGroupMember(user.id, groupId))) notFound();

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      members: { include: { user: true } },
      expenses: { include: { shares: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!group) notFound();

  const members = group.members.map((m) => ({ id: m.user.id, name: m.user.name }));
  const balances = computeBalances(members, group.expenses);

  return (
    <section>
      <h1>{group.name}</h1>
      <h2>Balances</h2>
      <ul>
        {balances.map((b) => (
          <li key={b.userId}>
            {members.find((m) => m.id === b.userId)?.name}: {formatCurrency(b.net)}
          </li>
        ))}
      </ul>
      <h2>Add expense</h2>
      <ExpenseForm groupId={group.id} />
      <h2>Expenses</h2>
      <ul>
        {group.expenses.map((e) => (
          <li key={e.id}>
            {e.description} — {formatCurrency(e.amount)}
          </li>
        ))}
      </ul>
    </section>
  );
}
