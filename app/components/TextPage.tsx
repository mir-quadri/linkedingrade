import type { ReactNode } from "react";

import SiteFooter from "./SiteFooter";
import SiteNav from "./SiteNav";

type Props = {
  sectionNum: string;
  eyebrow: string;
  title: ReactNode;
  deck?: ReactNode;
  updated?: string;
  children: ReactNode;
};

export default function TextPage({
  sectionNum,
  eyebrow,
  title,
  deck,
  updated,
  children,
}: Props) {
  return (
    <>
      <SiteNav />
      <main className="text-page">
        <div className="container-x">
          <header className="text-page-head">
            <div className="meta-line">
              <span>{sectionNum}</span>
              <span>{eyebrow}</span>
              {updated ? <span>UPDATED · {updated}</span> : null}
            </div>
            <h1>{title}</h1>
            {deck ? <p className="deck">{deck}</p> : null}
          </header>
          <div className="text-page-body">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
