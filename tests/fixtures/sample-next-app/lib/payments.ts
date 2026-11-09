import { config, PAYMENTS_API_KEY } from "@/lib/config";

export type PaymentRequest = { fromUserId: string; toUserId: string; amount: number };
export type PaymentResult = { externalId: string; status: "pending" | "settled" };

class TimeoutError extends Error {}

async function postWithTimeout(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PAYMENTS_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new TimeoutError("Payment request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function createPayment(request: PaymentRequest): Promise<PaymentResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxPaymentAttempts; attempt++) {
    try {
      const response = await postWithTimeout(
        `${config.paymentsBaseUrl}/v1/payments`,
        { from: request.fromUserId, to: request.toUserId, amount: request.amount },
        config.paymentsTimeoutMs,
      );
      if (!response.ok) throw new Error(`Payment failed with status ${response.status}`);
      const data = (await response.json()) as { id: string; status: PaymentResult["status"] };
      return { externalId: data.id, status: data.status };
    } catch (error) {
      lastError = error;
      if (error instanceof TimeoutError) continue;
      throw error;
    }
  }
  throw lastError;
}
