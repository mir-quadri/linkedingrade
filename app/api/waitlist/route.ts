import { NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KIT_TIMEOUT_MS = 10_000;
const KIT_BASE_URL = "https://api.kit.com/v4";

const INVALID_EMAIL_ERROR = "That doesn't look like a valid email.";
const SERVER_CONFIG_ERROR = "Server config issue. Try again later.";
const GENERIC_KIT_ERROR = "Couldn't add you. Try again?";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: INVALID_EMAIL_ERROR }, { status: 400 });
  }

  const email =
    typeof payload === "object" && payload !== null && "email" in payload
      ? String((payload as { email: unknown }).email ?? "").trim()
      : "";

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: INVALID_EMAIL_ERROR }, { status: 400 });
  }

  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;

  if (!apiKey) {
    console.error("[waitlist] missing env var: KIT_API_KEY");
    return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });
  }
  if (!formId) {
    console.error("[waitlist] missing env var: KIT_FORM_ID");
    return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KIT_TIMEOUT_MS);

  try {
    const createResp = await kitFetch(
      `${KIT_BASE_URL}/subscribers`,
      apiKey,
      { email_address: email },
      controller.signal,
    );
    if (!createResp.ok) {
      const body = await createResp.text().catch(() => "");
      console.error(
        `[waitlist] kit create-subscriber error status=${createResp.status} body=${body}`,
      );
      return NextResponse.json({ error: GENERIC_KIT_ERROR }, { status: 500 });
    }

    const attachResp = await kitFetch(
      `${KIT_BASE_URL}/forms/${encodeURIComponent(formId)}/subscribers`,
      apiKey,
      { email_address: email },
      controller.signal,
    );
    if (!attachResp.ok) {
      const body = await attachResp.text().catch(() => "");
      console.error(
        `[waitlist] kit attach-to-form error status=${attachResp.status} body=${body}`,
      );
      return NextResponse.json({ error: GENERIC_KIT_ERROR }, { status: 500 });
    }

    console.log(`[waitlist] signup ok: ${email} at ${new Date().toISOString()}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[waitlist] kit request failed: ${reason}`);
    return NextResponse.json({ error: GENERIC_KIT_ERROR }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

function kitFetch(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Kit-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });
}
