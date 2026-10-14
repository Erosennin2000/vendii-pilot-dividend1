import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Claim your dividends from Coronation and First Registrars | Dividendi",
  description: "Tell us which companies you hold shares in. We fill your registrar mandate form, sign it with your authority, and send it for you.",
};

/** Public, no sign-in. The pilot is open to anyone with the link. */
export default function PilotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="appbar">
        <Link href="/" aria-label="Dividendi home"><Logo height={22} /></Link>
        <span className="spacer" />
        <span className="tag gold">Pilot</span>
      </header>
      <main className="appmain">{children}</main>
    </>
  );
}
