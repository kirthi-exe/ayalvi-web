"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { genderOptions, interestOptions } from "@/lib/constants/site";
import { getUtm, track } from "@/lib/analytics/events";
export function WaitlistForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const started = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setErrors({});
    setMessage("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          is_18_plus: values.is_18_plus === "on",
          ...getUtm(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.errors || {});
        setMessage(result.message || "Please try again.");
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        );
        return;
      }
      track("waitlist_completed");
      router.push("/waitlist/success");
    } catch {
      setMessage(
        "We couldn’t connect. Please check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }
  const attrs = (name: string) => ({
    id: name,
    name,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  const error = (name: string) =>
    errors[name] ? (
      <span className="field-error" id={`${name}-error`}>
        {errors[name]}
      </span>
    ) : null;
  return (
    <form
      ref={form}
      onSubmit={submit}
      onFocus={() => {
        if (!started.current) {
          track("waitlist_started");
          started.current = true;
        }
      }}
      className="waitlist-form"
      aria-label="Ayalvi Early Access waitlist"
    >
      <div className="form-top">
        <span className="eyebrow">YOUR NEXT CHAPTER</span>
        <span aria-hidden="true">↗</span>
      </div>
      <label htmlFor="email">Email address</label>
      <input
        {...attrs("email")}
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        maxLength={254}
      />
      {error("email")}
      <label htmlFor="city_region">City / Region</label>
      <input
        {...attrs("city_region")}
        autoComplete="address-level2"
        placeholder="e.g. Zürich, Switzerland"
        required
        minLength={2}
        maxLength={100}
      />
      {error("city_region")}
      <div className="form-grid">
        {[
          ["gender", "Gender", genderOptions],
          ["interested_in", "Interested in", interestOptions],
        ].map(([name, label, options]) => (
          <div key={name as string}>
            <label htmlFor={name as string}>{label}</label>
            <select {...attrs(name as string)} required defaultValue="">
              <option value="" disabled>
                Select an option
              </option>
              {(options as readonly string[]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            {error(name as string)}
          </div>
        ))}
      </div>
      <label htmlFor="heard_from">
        How did you hear about Ayalvi?{" "}
        <span className="optional">(optional)</span>
      </label>
      <input
        {...attrs("heard_from")}
        placeholder="Instagram, a friend, somewhere else…"
        maxLength={120}
      />
      {error("heard_from")}
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="checkbox" htmlFor="is_18_plus">
        <input {...attrs("is_18_plus")} type="checkbox" required />I confirm
        that I am 18 or older.
      </label>
      {error("is_18_plus")}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Joining…" : "Join the Ayalvi Waitlist"}{" "}
        <span aria-hidden="true">↗</span>
      </button>
      <p className="form-feedback" role="status" aria-live="polite">
        {message}
      </p>
      <p className="microcopy">
        No spam. We’ll only contact you about Ayalvi Early Access and important
        launch updates.
      </p>
      <p className="microcopy">
        Read our <Link href="/privacy">Privacy Notice</Link> and{" "}
        <Link href="/terms">Terms</Link>.
      </p>
    </form>
  );
}
