export type Member = { id: string; name: string };
export type ExpenseWithShares = {
  id: string;
  paidById: string;
  amount: number;
  shares: { userId: string; amount: number }[];
};
export type Balance = { userId: string; net: number };
export type Transfer = { fromUserId: string; toUserId: string; amount: number };

export function computeBalances(members: Member[], expenses: ExpenseWithShares[]): Balance[] {
  const balances: Balance[] = [];
  for (const member of members) {
    let net = 0;
    for (const expense of expenses) {
      if (expense.paidById === member.id) net += expense.amount;
      const share = expense.shares.find((s) => s.userId === member.id);
      if (share) net -= share.amount;
    }
    balances.push({ userId: member.id, net });
  }
  return balances;
}

export function settleUp(members: Member[], expenses: ExpenseWithShares[]): Transfer[] {
  const balances = computeBalances(members, expenses);
  const transfers: Transfer[] = [];

  for (const member of members) {
    const debtor = balances.find((b) => b.userId === member.id);
    if (!debtor || debtor.net >= 0) continue;

    while (debtor.net < -0.009) {
      const creditor = balances.find((b) => b.net > 0.009);
      if (!creditor) break;
      const amount = Math.min(-debtor.net, creditor.net);
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
      debtor.net += amount;
      creditor.net -= amount;
    }
  }
  return transfers;
}
