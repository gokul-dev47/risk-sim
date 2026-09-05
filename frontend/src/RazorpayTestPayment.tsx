import React, { useEffect, useMemo, useState } from "react";

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://127.0.0.1:8010";

type VerifyResult = {
  verified: boolean;
  payment_id: string;
  order_id: string;
  payment_status: string;
  order_status: string;
  amount: number;
  currency: string;
  test_mode: boolean;
  message: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      description?: string;
      order_id: string;
      theme?: { color?: string };
      handler: (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => void;
      modal?: { ondismiss?: () => void };
    }) => { open: () => void };
  }
}

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay Checkout SDK failed to load.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Razorpay Checkout SDK failed to load."));
    document.head.appendChild(script);
  });
}

export default function RazorpayTestPayment() {
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState("Loading Razorpay Checkout...");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    loadRazorpayCheckout()
      .then(() => {
        setSdkReady(true);
        setStatus("Ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Razorpay SDK failed to load.");
        setStatus("Checkout unavailable");
      });
  }, []);

  const amountLabel = useMemo(() => {
    const value = Number(amount);
    return Number.isFinite(value) && value > 0 ? `₹${value.toFixed(2)}` : "₹—";
  }, [amount]);

  async function createOrder() {
    setLoading(true);
    setError("");
    setVerifyResult(null);
    setOrderId("");
    setStatus("Creating Razorpay Test Mode order...");

    try {
      const value = Number(amount);

      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Enter a valid amount greater than ₹0.");
      }

      await loadRazorpayCheckout();

      const receipt = `risk-sim-${Date.now()}`;

      const response = await fetch(`${BACKEND_URL}/razorpay/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_inr: value,
          receipt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail ?? "Unable to create Razorpay order.");
      }

      if (!data.order_id || !data.key_id) {
        throw new Error("Backend returned an incomplete Razorpay order.");
      }

      setOrderId(data.order_id);
      setStatus("Opening Razorpay Test Checkout...");

      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout SDK is not available.");
      }

      const checkout = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "Risk-Sim AI Risk Manager",
        description: "Razorpay Test Mode payment",
        order_id: data.order_id,
        theme: { color: "#6366f1" },

        handler: async (paymentResponse) => {
          setLoading(true);
          setStatus("Verifying payment signature on server...");
          setError("");

          try {
            const verifyResponse = await fetch(
              `${BACKEND_URL}/razorpay/verify`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order_id: data.order_id,
                  payment_id: paymentResponse.razorpay_payment_id,
                  signature: paymentResponse.razorpay_signature,
                }),
              }
            );

            const result = await verifyResponse.json();

            if (!verifyResponse.ok) {
              throw new Error(
                result?.detail ?? "Server-side payment verification failed."
              );
            }

            setVerifyResult(result);
            setStatus("Payment verified successfully");
          } catch (verificationError) {
            setStatus("Verification failed");
            setError(
              verificationError instanceof Error
                ? verificationError.message
                : "Payment verification failed."
            );
          } finally {
            setLoading(false);
          }
        },

        modal: {
          ondismiss: () => {
            setLoading(false);
            setStatus("Checkout dismissed");
          },
        },
      });

      checkout.open();
    } catch (createError) {
      setStatus("Unable to start checkout");
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create Razorpay order."
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Razorpay Test Checkout</h1>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300">
            TEST MODE
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Create a real Razorpay Test Mode order, complete Checkout, and verify
          the payment signature server-side. No real money is charged.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Payment sandbox
            </div>
            <div className="mt-1 text-lg font-medium text-white">
              Test transaction
            </div>
          </div>

          <label className="block text-sm text-slate-300">
            Amount
            <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-slate-950/70 px-4">
              <span className="text-slate-400">₹</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                min="1"
                step="1"
                className="w-full bg-transparent px-3 py-3 text-white outline-none"
                disabled={loading}
              />
            </div>
          </label>

          <button
            type="button"
            onClick={createOrder}
            disabled={loading || !sdkReady}
            className="mt-5 w-full rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!sdkReady
              ? "Loading Checkout..."
              : loading
                ? "Processing..."
                : `Pay ${amountLabel} with Razorpay`}
          </button>

          <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/50 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Flow
            </div>
            <div className="mt-2 text-sm leading-7 text-slate-300">
              Backend order → Razorpay Checkout → payment signature → backend
              verification → audit event
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-400/5 p-4 text-xs leading-6 text-slate-400">
            <span className="font-medium text-indigo-300">Scope of this panel:</span>{" "}
            demonstrates a real Razorpay Test Mode order/payment lifecycle and
            server-side signature verification. It is separate from the
            fraud-risk engine (Random Forest + Isolation Forest fusion) shown
            elsewhere in this dashboard — this payment is not scored by that
            model, and no production Razorpay transaction data is used
            anywhere in this project. Both flows write to the same audit
            chain, distinguishable by event type.
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Verification status
          </div>

          <div className="mt-3 text-xl font-semibold text-white">{status}</div>

          {orderId && (
            <div className="mt-5">
              <div className="text-xs text-slate-500">Order ID</div>
              <div className="mt-1 break-all font-mono text-xs text-slate-300">
                {orderId}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {verifyResult && (
            <div className="mt-5 space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <div className="font-medium text-emerald-300">
                ✓ Server-side payment verification passed
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Payment</div>
                  <div className="font-mono text-xs text-slate-300">
                    {verifyResult.payment_id}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="text-slate-200">
                    {verifyResult.payment_status}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Order status</div>
                  <div className="text-slate-200">
                    {verifyResult.order_status}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Amount</div>
                  <div className="text-slate-200">
                    ₹{(verifyResult.amount / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
