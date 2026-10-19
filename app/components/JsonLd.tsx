import { serializeJsonLd } from '@/lib/jsonLd';

/** Renders schema.org structured data as a JSON-LD script tag. */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes `<`, and the data is built from our
      // own constants, never user input.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
