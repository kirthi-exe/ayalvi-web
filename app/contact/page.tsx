import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Contact" };
export default function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main id="main" className="document wrap">
      <span className="eyebrow">AYALVI / GET IN TOUCH</span>
      <h1>Let’s talk.</h1>
      <p>
        For questions about Ayalvi, Early Access or your waitlist information,
        get in touch with our team.
      </p>
      {email ? (
        <a className="button" href={`mailto:${email}`}>
          Contact Ayalvi ↗
        </a>
      ) : (
        <p className="legal-notice">
          Our contact channel is being prepared and will be published before
          public launch.
        </p>
      )}
      <h2>Looking for Early Access?</h2>
      <p>
        We’re bringing Tamil connections closer across Switzerland, Germany and
        Austria.
      </p>
      <Link href="/#early-access">Join the waitlist →</Link>
    </main>
  );
}
