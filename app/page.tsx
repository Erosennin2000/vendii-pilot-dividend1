import Link from "next/link";
import { Logo } from "@/components/Logo";

/** The Vendii pilot page. One way in: the Coronation and First Registrars pilot. */
export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <Logo height={34} onDark />
          <span className="tag light">Pilot</span>
        </div>
        <div className="hero-grid">
          <div className="hero-main">
            <h1>Get back what&apos;s yours.</h1>
            <p>
              Vendii helps Nigerian shareholders recover unclaimed dividends. We fill in the registrar&apos;s mandate form, send it for you
              with your signed permission, and follow up. The registrar pays you directly.
            </p>
            <div className="hero-cta">
              <Link className="btn gold lg" href="/pilot">Start the pilot</Link>
            </div>
            <div className="hero-note">The pilot covers Coronation Registrars and First Registrars. It takes about ten minutes.</div>
          </div>
          <div className="hero-stat">
            <div className="sum">{"₦"}270bn</div>
            <div className="lbl">in dividends sits unclaimed in Nigeria, much of it owed to people who bought shares years ago</div>
            <div className="src">Source: Securities and Exchange Commission, October 2025</div>
          </div>
        </div>
      </section>

      <section className="strip">
        <h2>Four steps, one sitting</h2>
        <div className="strip-grid four">
          <div className="strip-item">
            <div className="n">1</div>
            <h3>You</h3>
            <p>Your name and the other ways it was written, your email and your CHN or CSCS number. We confirm your email with a code.</p>
          </div>
          <div className="strip-item">
            <div className="n">2</div>
            <h3>Your companies</h3>
            <p>Pick the Coronation and First companies you hold shares in. Add as many as you need.</p>
          </div>
          <div className="strip-item">
            <div className="n">3</div>
            <h3>Your details</h3>
            <p>Your BVN and bank account, and the address, phone and next of kin you gave when you bought the shares.</p>
          </div>
          <div className="strip-item">
            <div className="n">4</div>
            <h3>Sign and send</h3>
            <p>Add your photo and signature, choose how to pay us, and we email the registrar for you.</p>
          </div>
        </div>
      </section>

      <section className="trust">
        <div><div className="k">{"₦"}0</div><div className="v">Held by us. The registrar pays your own account directly</div></div>
        <div><div className="k">10%</div><div className="v">Our fee, taken by direct debit only after a dividend reaches you. Or pay {"₦"}200 per company up front</div></div>
        <div><div className="k">2</div><div className="v">Documents sent for you: your completed mandate form and your signed letter of authority</div></div>
      </section>

      <p className="foot-note tiny">
        You can claim directly from any registrar yourself at no cost. Vendii does the paperwork and the follow-up for you.{" "}
        <Link href="/sign-in?next=/ops/pilot" className="link">Staff sign-in</Link>
      </p>
    </>
  );
}
