"use client";
import { useEffect, useState } from "react";
import { referralReceipt } from "@/lib/referrals/storage";
import { track } from "@/lib/analytics/events";
export function ReferralLink() {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => {
      const code = referralReceipt();
      setLink(code ? `${window.location.origin}/ref/${code}` : "");
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied.");
      track("referral_link_copied");
    } catch {
      setMessage("Copy is unavailable. Select and copy the link below.");
    }
  }
  if (!link) return null;
  return (
    <section className="referral-panel" aria-label="Your referral link">
      <h2>Invite your friends.</h2>
      <p>
        Want to increase your chances of earlier access? Invite your friends.
      </p>
      <label htmlFor="referral-link">Your invitation link</label>
      <input
        id="referral-link"
        value={link}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
      />
      <button className="button" type="button" onClick={copy}>
        Copy link
      </button>
      <p className="microcopy">
        Referral credit is available for new waitlist entries. Existing signups
        keep their original attribution. An invitation does not guarantee
        earlier access.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
