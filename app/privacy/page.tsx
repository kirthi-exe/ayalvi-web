import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false },
};
export default function Privacy() {
  return (
    <main id="main" className="document wrap">
      <span className="eyebrow">AYALVI / PRIVACY</span>
      <h1>Privacy Notice</h1>
      <p className="legal-notice">
        Draft placeholder. Final legal review is required before public launch.
        The responsible legal entity, contact details, legal basis, retention
        periods and international transfer arrangements must be confirmed before
        collecting public signups.
      </p>
      <h2>What the waitlist collects</h2>
      <p>
        We collect your email, city or region, gender, who you are interested in
        meeting and your confirmation that you are 18 or older. You can choose
        not to disclose gender and interests. How you heard about Ayalvi and
        campaign source information are optional.
      </p>
      <h2>Why we collect it</h2>
      <p>
        We use waitlist information to prepare regional testing and send Early
        Access and important launch updates. We do not collect an exact date of
        birth, phone number, full address or religion through this form.
      </p>
      <h2>Separate from the app</h2>
      <p>
        This website’s waitlist is separate from mobile dating profiles,
        matches, conversations, reports, blocks and push tokens. It does not
        access those records.
      </p>
      <h2>Hosting and storage</h2>
      <p>
        The website is prepared for Vercel hosting and Supabase database
        storage. The final notice must identify the actual providers, storage
        locations, safeguards and any additional processors before launch.
      </p>
      <h2>Analytics</h2>
      <p>
        No analytics provider or tracking cookies are enabled by default. If a
        signup URL includes campaign tags, the source, medium and campaign can
        be stored with that signup. Optional event hooks exclude form values and
        email addresses. Any future analytics provider requires an updated
        notice and an appropriate consent assessment.
      </p>
      <h2>Your choices and retention</h2>
      <p>
        You may request removal from the waitlist through our published contact
        channel once it is configured. Before launch, we must publish the
        applicable privacy rights, how to exercise them, a verified contact
        address and a defined deletion schedule.
      </p>
      <Link href="/contact">Contact Ayalvi →</Link>
    </main>
  );
}
