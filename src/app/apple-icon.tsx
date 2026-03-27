import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#000000",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "radial-gradient(circle at top, rgba(163,230,53,0.42), rgba(0,0,0,0) 62%)",
            height: "100%",
            left: 0,
            position: "absolute",
            top: 0,
            width: "100%",
          }}
        />
        <div
          style={{
            alignItems: "center",
            background: "linear-gradient(180deg, rgba(39,39,42,0.96), rgba(9,9,11,1))",
            border: "8px solid rgba(163,230,53,0.28)",
            borderRadius: 44,
            boxShadow: "0 22px 48px rgba(0,0,0,0.35)",
            color: "#f4f4f5",
            display: "flex",
            fontSize: 88,
            fontStyle: "normal",
            fontWeight: 700,
            height: 136,
            justifyContent: "center",
            width: 136,
          }}
        >
          T
        </div>
      </div>
    ),
    size,
  );
}