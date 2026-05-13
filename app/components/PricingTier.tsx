import Link from "next/link";

export type Feature = { label: React.ReactNode; excluded?: boolean };

type Props = {
  tier: string;
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: Feature[];
  ctaLabel: string;
  ctaHref?: string;
  featured?: boolean;
};

export default function PricingTier({
  tier,
  name,
  price,
  per,
  blurb,
  features,
  ctaLabel,
  ctaHref = "#cta",
  featured,
}: Props) {
  return (
    <div className={`price${featured ? " featured" : ""}`}>
      <div className="tier-label">{tier}</div>
      <h3>{name}</h3>
      <div className="amt">
        <span className="num">{price}</span>
        <span className="per">{per}</span>
      </div>
      <div className="blurb">{blurb}</div>
      <ul>
        {features.map((f, i) => (
          <li key={i} className={f.excluded ? "x" : undefined}>
            <span>{f.label}</span>
          </li>
        ))}
      </ul>
      <div className="cta">
        <Link
          href={ctaHref}
          className={`btn ${featured ? "btn-primary" : "btn-ghost"}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
