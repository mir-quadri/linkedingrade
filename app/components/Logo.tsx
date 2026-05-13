type Variant = "primary" | "reversed" | "mono";

type Props = {
  variant?: Variant;
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
};

export default function Logo({
  variant = "primary",
  size = 24,
  className,
  "aria-hidden": ariaHidden = true,
}: Props) {
  const containerFill =
    variant === "reversed" ? "#FFFFFF" : variant === "mono" ? "currentColor" : "#0F2138";
  const cornerFill =
    variant === "mono" ? "rgba(255,255,255,0.25)" : "#C8102E";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden={ariaHidden}
      className={className}
    >
      <rect width="100" height="100" rx="6" fill={containerFill} />
      <path
        d="M 64 64 L 100 64 L 100 94 A 6 6 0 0 1 94 100 L 64 100 Z"
        fill={cornerFill}
      />
    </svg>
  );
}
