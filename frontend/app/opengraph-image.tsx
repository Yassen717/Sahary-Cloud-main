import { ImageResponse } from "next/og";

export const alt = "Sahary Cloud - Solar-Powered Hosting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #052e16 0%, #14532d 55%, #16a34a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "48px" }}>
          <div
            style={{
              width: "96px",
              height: "96px",
              borderRadius: "24px",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#16a34a",
              fontSize: "56px",
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ fontSize: "48px", fontWeight: 700 }}>Sahary Cloud</div>
        </div>
        <div style={{ fontSize: "72px", fontWeight: 800, lineHeight: 1.1, maxWidth: "900px" }}>
          Cloud Computing, Powered by the Sun
        </div>
        <div style={{ fontSize: "32px", marginTop: "32px", color: "#bbf7d0" }}>
          Solar-powered VPS hosting in Libya
        </div>
      </div>
    ),
    size,
  );
}
