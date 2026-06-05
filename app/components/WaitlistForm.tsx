"use client";

import { useId, useState, type FormEvent } from "react";

import { WAITLIST_CTA } from "@/lib/copy";

type Status = "idle" | "submitting" | "success" | "error";

type Props = {
  buttonLabel?: string;
  fineprint?: string[];
  placeholder?: string;
};

export default function WaitlistForm({
  buttonLabel = WAITLIST_CTA,
  fineprint,
  placeholder = "you@work.com",
}: Props) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setStatus("error");
        setErrorMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Try again.");
    }
  }

  if (status === "success") {
    return (
      <p
        role="status"
        className="font-mono"
        style={{
          maxWidth: 520,
          padding: "13px 14px",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--r-sm)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: 14,
          letterSpacing: "-0.005em",
        }}
      >
        You&apos;re in. Check your email.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 520,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          disabled={status === "submitting"}
          style={{
            flex: "1 1 240px",
            minWidth: 0,
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--r-sm)",
            padding: "13px 14px",
            font: "inherit",
            fontSize: 15,
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="btn btn-primary btn-lg"
        >
          {status === "submitting" ? "Submitting…" : buttonLabel}
        </button>
      </div>
      {fineprint && fineprint.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            color: "var(--text-3)",
            fontSize: 12,
            marginTop: 4,
          }}
        >
          {fineprint.map((item) => (
            <span
              key={item}
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 4,
                  height: 4,
                  background: "var(--text-3)",
                  borderRadius: "50%",
                }}
              />
              {item}
            </span>
          ))}
        </div>
      )}
      {status === "error" && errorMessage && (
        <p
          role="alert"
          style={{
            fontSize: 13,
            color: "var(--accent)",
            marginTop: 4,
          }}
        >
          {errorMessage}
        </p>
      )}
    </form>
  );
}
