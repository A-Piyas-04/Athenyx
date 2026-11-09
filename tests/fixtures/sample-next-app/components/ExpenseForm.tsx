"use client";

import { useState } from "react";

export function ExpenseForm({ groupId }: { groupId: string }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, description, amount: Number(amount) }),
    });
    setSaving(false);
    if (!response.ok) {
      setError("Could not save the expense.");
      return;
    }
    setDescription("");
    setAmount("");
    window.location.reload();
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Dinner"
      />
      <input
        aria-label="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="0.00"
      />
      <button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
