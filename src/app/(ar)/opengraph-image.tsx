import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "نصيبك - نوصّلك بشريك العمر بالحلال";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logoBase64 =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiB2aWV3Qm94PSIwIDAgMTAwNi44IDQzOS45Ij4KICA8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMjkuMC4xLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogMi4xLjAgQnVpbGQgMTkyKSAgLS0+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5zdDAgewogICAgICAgIGZpbGw6IHVybCgjbGluZWFyLWdyYWRpZW50KTsKICAgICAgfQoKICAgICAgLnN0MSB7CiAgICAgICAgZmlsbDogIzIyNDc2YTsKICAgICAgfQogICAgPC9zdHlsZT4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0ibGluZWFyLWdyYWRpZW50IiB4MT0iNDI3LjgiIHkxPSIzNDYuMyIgeDI9IjQ4OC45IiB5Mj0iMzQ2LjMiIGdyYWRpZW50VHJhbnNmb3JtPSJ0cmFuc2xhdGUoOTA2LjUgNjkyLjYpIHJvdGF0ZSgtMTgwKSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBvZmZzZXQ9Ii4xIiBzdG9wLWNvbG9yPSIjYzE5MjUwIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2MyOTM0ZiIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPGc+CiAgICA8cmVjdCBjbGFzcz0ic3QxIiB4PSI0MTcuNSIgeT0iMzE1LjEiIHdpZHRoPSIxMjIuMiIgaGVpZ2h0PSI2Mi41IiByeD0iMzEuMyIgcnk9IjMxLjMiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0zODMuMiwzMTUuNWM0MS4yLTUuNSw0Ny41LDU2LjIsOS41LDYxLjUtNDMsNi00OC43LTU2LjItOS41LTYxLjVaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QwIiBkPSJNNDQzLjksMzE1LjVjNDEuMi01LjUsNDcuNSw1Ni4yLDkuNSw2MS41LTQzLDYtNDguNy01Ni4yLTkuNS02MS41WiIvPgogIDwvZz4KICA8Zz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0zNDkuNCwyMzguNGMyLjUsMCw0LjEsMS42LDQuMSw0LjF2NTMuMWMwLDIuNS0xLjYsNC4xLTQuMSw0LjFoLTE3N2MtNDUuNCwwLTg2LjctOC42LTExMS42LTIwbDE0LjMtNTEuNWMyNyw3LDYxLjcsMTAuMiw5NS4zLDEwLjJoMTAzLjRWNTQuNGg1NS4ydjE4NGgyMC40Wk0yMDQuNiwxODQuNGMzLjcsMCw1LjMtMS4yLDUuMy00LjFzLTEuNi00LjEtNS4zLTQuMWgtNDMuM2wtMTEuOS0yMC45LDM2LjQtNDkuNSwyMy4zLDE4LTIwLjQsMjIuOWgxNS41YzE5LjIsMCwzMi4zLDEzLjUsMzIuMywzMi43cy0xMy45LDM0LjMtMzQuMywzNC4zaC01OC4xbDYuNS0yOS40aDU0WiIvPgogICAgPHBhdGggY2xhc3M9InN0MSIgZD0iTTQ0NS40LDIzOC40YzIuNSwwLDQuMSwxLjYsNC4xLDQuMXY1My4xYzAsMi41LTEuNiw0LjEtNC4xLDQuMWgtOTYuMWMtMi41LDAtNC4xLTEuNi00LjEtNC4xdi01My4xYzAtMi41LDEuNi00LjEsNC4xLTQuMWgyMC40di00NWg1NS4ydjQ1aDIwLjRaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QxIiBkPSJNNTY2LDIzOC40YzIuNSwwLDQuMSwxLjYsNC4xLDQuMXY1My4xYzAsMi41LTEuNiw0LjEtNC4xLDQuMWgtMTIwLjZjLTIuNSwwLTQuMS0xLjYtNC4xLTQuMXYtNTMuMWMwLTIuNSwxLjYtNC4xLDQuMS00LjFoMzIuN3YtNjkuNWg1NS4ydjY5LjVoMzIuN1oiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik04NDYuOSwyMzguNGMyLjUsMCw0LjEsMS42LDQuMSw0LjF2NTMuMWMwLDIuNS0xLjYsNC4xLTQuMSw0LjFoLTI4MC45Yy0yLjUsMC00LjEtMS42LTQuMS00LjF2LTUzLjFjMC0yLjUsMS42LTQuMSw0LjEtNC4xaDIwLjR2LTc1LjZoMTg1LjJjMjksMCw1MC43LDE1LjksNTguMSw0Mi45bDksMzIuN2g4LjJaTTY0MS43LDIyMnYxNi40aDEzOS44bC0yLjUtN2MtMi41LTYuNS02LjEtOS40LTEzLjEtOS40aC0xMjQuM1oiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik04NjcuMywxOTMuNGg1NS4ydjEwNi4zaC03NS42Yy0yLjUsMC00LjEtMS42LTQuMS00LjF2LTUzLjFjMC0yLjUsMS42LTQuMSw0LjEtNC4xaDIwLjR2LTQ1WiIvPgogIDwvZz4KICA8cGF0aCBjbGFzcz0ic3QxIiBkPSJNODk4LjEsMTY3LjhjLTQxLjIsNS41LTQ3LjUtNTYuMi05LjUtNjEuNSw0My02LDQ4LjcsNTYuMiw5LjUsNjEuNVoiLz4KPC9zdmc+";

export default async function Image() {
  const fontPath = join(process.cwd(), "node_modules/@fontsource/cairo/files/cairo-arabic-600-normal.woff");
  let fontData: ArrayBuffer | undefined;
  try {
    fontData = (await readFile(fontPath)).buffer as ArrayBuffer;
  } catch {
    // Font not available, fall back to logo-only
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f8f9fc 0%, #eef1f8 50%, #f5f0e8 100%)",
          position: "relative",
        }}
      >
        {/* Decorative top bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #22476a, #2d5280, #c19250)",
            display: "flex",
          }}
        />

        {/* Decorative circles */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(34, 71, 106, 0.06)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 250,
            height: 250,
            borderRadius: "50%",
            background: "rgba(193, 146, 80, 0.06)",
            display: "flex",
          }}
        />

        {/* Logo */}
        <img
          src={logoBase64}
          width={480}
          height={210}
          style={{ marginBottom: 40 }}
        />

        {/* Tagline in English (below logo which already has Arabic branding) */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#22476a",
            textAlign: "center",
            display: "flex",
            letterSpacing: "-0.02em",
          }}
        >
          Jordanian Marriage Platform
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #c19250, #2d5280, #22476a)",
            display: "flex",
          }}
        />

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            fontSize: 20,
            color: "#9ca3af",
            display: "flex",
          }}
        >
          naseebak.com
        </div>
      </div>
    ),
    { ...size }
  );
}
