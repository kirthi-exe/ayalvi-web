import Link from "next/link";
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="Ayalvi">
      AYALVI<span className="wordmark-dot">.</span>
    </span>
  );
}
export function Header() {
  return (
    <header className="header wrap">
      <Link href="/" aria-label="Ayalvi home">
        <Wordmark />
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#why-ayalvi">Why Ayalvi</Link>
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/#early-access" className="nav-early">
          Early Access
        </Link>
      </nav>
      <Link className="button small" href="/#early-access">
        Join Early Access <span aria-hidden="true">↗</span>
      </Link>
    </header>
  );
}
export function Footer() {
  const socials = [
    ["Instagram", process.env.NEXT_PUBLIC_INSTAGRAM_URL],
    ["TikTok", process.env.NEXT_PUBLIC_TIKTOK_URL],
  ];
  return (
    <footer className="wrap footer">
      <div>
        <Link href="/">
          <Wordmark />
        </Link>
        <p>Tamil connections. Modern dating. Shared roots.</p>
      </div>
      <div className="footer-links">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/community-guidelines">Community Guidelines</Link>
        <Link href="/contact">Contact</Link>
        {socials.map(([label, url]) =>
          url && /^https:\/\//.test(url) ? (
            <a
              key={label}
              href={url}
              data-social={label}
              rel="noopener noreferrer"
              target="_blank"
            >
              {label} ↗
            </a>
          ) : null,
        )}
      </div>
      <div className="footer-bottom">
        <span>© 2026 Ayalvi</span>
        <span>Shared roots. New beginnings.</span>
        <span>Switzerland · Germany · Austria</span>
      </div>
    </footer>
  );
}
