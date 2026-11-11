import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Claim from Coronation and First Registrars | Vendii",
  description: "Tell us which companies you hold shares in. Vendii completes your registrar mandate form, signs it with your permission, and sends it for you.",
};

/** Public pilot pages: no staff chrome, just the logo and the steps. */
export default function PilotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="appbar">
        <Link href="/" aria-label="Vendii home"><Logo height={26} /></Link>
        <span className="spacer" />
        <span className="tag gold">Pilot</span>
      </header>
      <main className="appmain">
        {children}
        <div className="pwrap pfoot">
          <span>Vendii &middot; Get back what&apos;s yours</span>
          <span>The registrar pays you directly. Vendii never holds your money.</span>
        </div>
      </main>
    </>
  );
}
