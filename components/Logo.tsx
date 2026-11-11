/* eslint-disable @next/next/no-img-element */
/**
 * The Vendii horizontal logo. Primary (gold icon, blue wordmark) on light backgrounds, reversed (all white)
 * on Vendii Blue. `height` is the icon's diameter; the wordmark follows at fixed proportions. Never retype the name.
 * With `word` false, only the icon is shown.
 */
export function Logo({ height = 24, onDark = false, word = true }: { height?: number; onDark?: boolean; word?: boolean }) {
  const src = word
    ? onDark ? "/brand/vendii-logo-horizontal-reversed.svg" : "/brand/vendii-logo-horizontal-primary.svg"
    : onDark ? "/brand/vendii-icon-white.svg" : "/brand/vendii-icon-gold.svg";
  return (
    <span className="logo">
      <img src={src} alt="Vendii" style={{ height, width: "auto" }} />
    </span>
  );
}
