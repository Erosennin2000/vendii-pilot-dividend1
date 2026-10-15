import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Pilot admin | Vendii", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="appbar">
        <Link href="/" aria-label="Vendii home"><Logo height={26} /></Link>
        <span className="spacer" />
        <span className="tag">Staff</span>
      </header>
      <main className="appmain">{children}</main>
    </>
  );
}
