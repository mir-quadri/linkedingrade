import Logo from "./Logo";
import Wordmark from "./Wordmark";

type Props = {
  size?: number;
  fontSize?: number;
  dot?: boolean;
  variant?: "primary" | "reversed" | "mono";
  className?: string;
  "aria-label"?: string;
};

// Mark height = 1.2× wordmark cap-height; gap = 0.6× cap-height.
// Cap-height for Geist ≈ 0.72 of font-size.
export default function BrandLockup({
  size = 24,
  fontSize = 17,
  dot = true,
  variant = "primary",
  className,
  "aria-label": ariaLabel = "LinkedInGrade home",
}: Props) {
  const capHeight = fontSize * 0.72;
  const gap = capHeight * 0.6;
  return (
    <span
      className={className}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${gap}px`,
        fontWeight: 600,
        fontSize: `${fontSize}px`,
        letterSpacing: "-0.025em",
        lineHeight: 1,
      }}
    >
      <Logo variant={variant} size={size} />
      <Wordmark dot={dot} />
    </span>
  );
}
