# linkedingrade

Marketing site for linkedingrade.com — a Chrome extension that audits any LinkedIn profile in 30 seconds.
Built with Next.js 15, TypeScript, and Tailwind CSS.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable       | What it is                                                                            | Where to get it                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `KIT_API_KEY`  | Kit V4 API key. Sent on every request as the `X-Kit-Api-Key` header.                  | Kit dashboard → Settings → Developer → "V4 keys". Treat as a secret; never commit.                                         |
| `KIT_FORM_ID`  | Numeric ID of the Kit form that the `/api/waitlist` endpoint adds subscribers to.     | Kit dashboard → Grow → Landing Pages & Forms → open the form → the ID is in the URL (e.g. `…/forms/9436996/edit`).         |

In production, set both on the Vercel project (Settings → Environment Variables) for the `Production` and `Preview` environments.

