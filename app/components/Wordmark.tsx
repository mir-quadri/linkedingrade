type Props = {
  dot?: boolean;
  className?: string;
};

export default function Wordmark({ dot = true, className }: Props) {
  return (
    <span
      className={className}
      style={{ fontWeight: 700, letterSpacing: "-0.035em" }}
    >
      LinkedInGrade
      {dot && <span style={{ color: "var(--accent)" }}>.</span>}
    </span>
  );
}
