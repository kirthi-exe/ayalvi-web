import { ImageResponse } from "next/og";
export const alt = "Ayalvi — Tamil connections. Modern dating. Shared roots.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#FAF7F2",
        color: "#7A1F3D",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 90,
      }}
    >
      <div style={{ fontSize: 28, letterSpacing: 10, marginBottom: 45 }}>
        AYALVI
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 72,
          lineHeight: 1.12,
          fontFamily: "serif",
        }}
      >
        Tamil connections.
        <br />
        Modern dating.
        <br />
        Shared roots.
      </div>
      <div style={{ fontSize: 20, marginTop: 40, color: "#6F6669" }}>
        Switzerland · Germany · Austria
      </div>
    </div>,
    size,
  );
}
