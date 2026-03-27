import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
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
            border: "18px solid rgba(163,230,53,0.28)",
            borderRadius: 128,
            boxShadow: "0 40px 96px rgba(0,0,0,0.35)",
            color: "#f4f4f5",
            display: "flex",
            fontSize: 236,
            fontStyle: "normal",
            fontWeight: 700,
            height: 384,
            justifyContent: "center",
            width: 384,
          }}
        >
          T
        </div>
      </div>
    ),
    {
      height: 512,
      width: 512,
    },
  );
}