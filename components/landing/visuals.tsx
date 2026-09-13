export function Kolam({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1">
        <path d="M120 15C180 15 225 60 225 120S180 225 120 225 15 180 15 120 60 15 120 15Z" />
        <path d="M120 30C40 30 40 210 120 210S200 30 120 30ZM30 120C30 40 210 40 210 120S30 200 30 120Z" />
        <path d="M56 56C112 0 240 128 184 184S0 112 56 56ZM184 56C240 112 112 240 56 184S128 0 184 56Z" />
      </g>
    </svg>
  );
}
export function PhonePreview() {
  return (
    <div className="preview">
      <div className="preview-orbit" />
      <Kolam className="preview-pattern" />
      <span className="preview-note">A little closer to your people.</span>
      <div className="phone">
        <div className="phone-speaker" />
        <div className="phone-content">
          <span className="phone-brand">AYALVI</span>
          <span className="phone-rule" />
          <Kolam className="phone-art" />
          <h2>
            Shared roots.
            <br />
            <em>New beginnings.</em>
          </h2>
          <p>
            Your story starts
            <br />
            with a connection.
          </p>
          <span className="phone-pill">COMING SOON</span>
        </div>
        <div className="phone-home" />
      </div>
      <div className="preview-tag">
        <span className="live-dot" /> Made for Tamil connections
      </div>
      <p className="preview-caption">BRAND PREVIEW · APP IN DEVELOPMENT</p>
    </div>
  );
}
