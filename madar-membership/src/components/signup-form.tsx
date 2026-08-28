"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/app/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-constants";

const initialState: FormState = {};

export function SignupForm({
  invite,
  prefill,
}: {
  invite?: string;
  prefill?: { fullName?: string | null; phone?: string | null };
} = {}) {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form className="mp-form" action={formAction} noValidate>
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      {state.error ? (
        <p className="mp-alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName ?? prefill?.fullName ?? ""}
          placeholder="Your name"
        />
      </div>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email ?? ""}
          placeholder="you@example.com"
        />
      </div>

      <div className="field">
        <label htmlFor="phone">Phone number</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          defaultValue={state.values?.phone ?? prefill?.phone ?? ""}
          placeholder="078xxxxxxx"
        />
      </div>
      <p className="mp-hint">
        Needed for mobile money at checkout, and to find your membership if we do not have your
        email on file yet.
      </p>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
      </div>

      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
