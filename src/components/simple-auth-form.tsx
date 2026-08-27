"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-constants";

const initialState: FormState = {};

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** "Forgot password" — asks for an email and sends a reset link. */
export function ForgotPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.success) {
    return (
      <p className="mp-alert success" role="status">
        {state.success}
      </p>
    );
  }

  return (
    <form className="mp-form" action={formAction} noValidate>
      {state.error ? (
        <p className="mp-alert error" role="alert">
          {state.error}
        </p>
      ) : null}

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

      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

/** "Reset password" — sets a new password against a token from the email. */
export function ResetPasswordForm({ action, token }: { action: Action; token: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form className="mp-form" action={formAction} noValidate>
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p className="mp-alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="password">New password</label>
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
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
