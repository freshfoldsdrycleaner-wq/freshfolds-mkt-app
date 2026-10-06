import { ImageResponse } from "next/og";

export async function GET(
  _req: Request,
  { params }: { params: { size: string } }
) {
  const size = params.size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          color: "#ffffff",
          fontSize: size * 0.42,
          fontWeight: 800,
        }}
      >
        FF
      </div>
    ),
    { width: size, height: size }
  );
}