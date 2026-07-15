"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

function todayISODate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export default function OnboardMemberForm({ plans }) {
  const router = useRouter();
  const formId = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [joinDate, setJoinDate] = useState(todayISODate());
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone_number: phone,
          join_date: joinDate,
          plan_id: planId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to onboard member.");
        return;
      }

      setSuccess(`${name} was onboarded successfully.`);
      setName("");
      setPhone("");
      setJoinDate(todayISODate());
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="onboard-card">
      <h2 className="onboard-title">Onboard new member</h2>
      <form onSubmit={handleSubmit} className="onboard-form">
        <div className="field">
          <label htmlFor={`${formId}-name`}>Name</label>
          <div className="field-input-row">
            <input
              id={`${formId}-name`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${formId}-phone`}>Phone number</label>
          <div className="field-input-row">
            <input
              id={`${formId}-phone`}
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="91XXXXXXXXXX"
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${formId}-date`}>Date of joining</label>
          <div className="field-input-row">
            <input
              id={`${formId}-date`}
              type="date"
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${formId}-plan`}>Plan</label>
          <div className="field-input-row">
            <select
              id={`${formId}-plan`}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              required
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — ₹{plan.price}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}

        <button type="submit" className="btn-primary onboard-submit" disabled={submitting}>
          {submitting ? "Onboarding..." : "Onboard member"}
        </button>
      </form>
    </section>
  );
}
