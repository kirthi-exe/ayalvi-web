import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms", robots: { index: false } };
export default function Terms() {
  return (
    <main id="main" className="document wrap">
      <span className="eyebrow">AYALVI / TERMS</span>
      <h1>Early Access Terms</h1>
      <p className="legal-notice">
        Draft placeholder. Final legal review is required before public launch.
        The legal operator, contact details, applicable law and required
        regional disclosures must be completed.
      </p>
      <h2>Who can join</h2>
      <p>
        Ayalvi Early Access is for adults aged 18 or older. Our initial focus is
        Tamil singles across Switzerland, Germany and Austria. Submit accurate
        information and an email address you control.
      </p>
      <h2>What joining means</h2>
      <p>
        A waitlist signup expresses interest in Ayalvi. It does not create a
        dating profile or guarantee an invitation, a release date or a
        particular feature. Testing availability may vary by region.
      </p>
      <h2>Updates</h2>
      <p>
        We plan to contact waitlist members about Early Access and important
        launch updates. A verified channel for withdrawal must be available
        before public signups open.
      </p>
      <h2>Respectful use</h2>
      <p>
        Do not submit someone else’s information, automate abusive submissions
        or interfere with this website. See our{" "}
        <Link href="/community-guidelines">Community Guidelines</Link> for the
        standards we are building around.
      </p>
      <h2>The future app</h2>
      <p>
        The mobile app is in development. Separate app terms and privacy
        information will be provided before participation in testing or use of
        the service.
      </p>
    </main>
  );
}
