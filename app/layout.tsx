import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DemoTools } from "@/components/DemoTools";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Vendii | Get back what's yours",
  description: "Vendii helps Nigerian shareholders recover unclaimed dividends. We handle the paperwork and the follow-up with the registrar. The registrar pays you directly.",
  icons: { icon: [{ url: "/brand/favicon.ico" }, { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/brand/apple-touch-icon-180.png" },
  openGraph: { title: "Vendii | Get back what's yours", description: "Recover your unclaimed dividends. Registrars pay you directly.", images: ["/brand/og-image.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#295D8F" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        <Providers>
          {children}
          <DemoTools />
        </Providers>
      </body>
    </html>
  );
}
