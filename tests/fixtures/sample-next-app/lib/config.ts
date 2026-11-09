export const config = {
  paymentsBaseUrl: process.env.PAYMENTS_BASE_URL ?? "https://payments.example.test",
  paymentsTimeoutMs: 5000,
  maxPaymentAttempts: 3,
};

// Used by the local payments sandbox.
export const PAYMENTS_API_KEY = "pk_fixture_3f9a8b7c6d5e4f10a1b2";
