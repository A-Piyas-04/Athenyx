export type Share = { userId: string; amount: number };

export function splitEvenly(amount: number, memberIds: string[]): Share[] {
  if (memberIds.length === 0) throw new Error("Cannot split between zero members");
  const each = Number((amount / memberIds.length).toFixed(2));
  return memberIds.map((userId) => ({ userId, amount: each }));
}

export function splitByWeights(amount: number, weights: Record<string, number>): Share[] {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total <= 0) throw new Error("Weights must add up to a positive number");
  return Object.entries(weights).map(([userId, weight]) => ({
    userId,
    amount: Number(((amount * weight) / total).toFixed(2)),
  }));
}

export function totalOf(shares: Share[]): number {
  return shares.reduce((sum, share) => sum + share.amount, 0);
}
