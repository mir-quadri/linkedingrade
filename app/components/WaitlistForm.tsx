"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type Props = {
  id?: string;
  buttonLabel?: string;
  placeholder?: string;
};

export default function WaitlistForm({
  id,
  buttonLabel = "Get early access",
  placeholder = "you@work.com",
}: Props) {
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
        id={id}
        role="status"
        className="rounded-md border border-teal-600/40 bg-teal-600/10 px-4 py-3 text-sm text-teal-700 dark:text-teal-300"
      >
        You&apos;re in. Check your email.
      </p>
    );
  }

  const inputId = id ? `${id}-email` : "waitlist-email";

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full flex-col gap-2 sm:flex-row"
    >
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
        disabled={status === "submitting"}
        className="flex-1 rounded-md border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-md bg-blue-600 px-5 py-3 text-base font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 disabled:opacity-60 dark:focus-visible:ring-offset-neutral-950"
      >
        {status === "submitting" ? "Submitting…" : buttonLabel}
      </button>
      {status === "error" && errorMessage && (
        <p
          role="alert"
          className="sm:basis-full text-sm text-orange-600 dark:text-orange-400"
        >
          {errorMessage}
        </p>
      )}
    </form>
  );
}
