"use client";

import { useId, useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type Props = {
  id?: string;
  buttonLabel?: string;
  placeholder?: string;
  successLabel?: string;
};

export default function WaitlistForm({
  id,
  buttonLabel = "Get early access",
  placeholder = "you@work.com",
  successLabel = "You're in. Check your email.",
}: Props) {
  const reactId = useId();
  const inputId = `${id ?? "waitlist"}-${reactId}`;

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
      <div className="hero-form" id={id}>
        <p role="status" className="form-status">
          {successLabel}
        </p>
      </div>
    );
  }

  return (
    <form className="hero-form" id={id} onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <input
        id={inputId}
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={placeholder}
        aria-label="Email"
        disabled={status === "submitting"}
      />
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : buttonLabel}
      </button>
      {status === "error" && errorMessage && (
        <p role="alert" className="form-error">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
