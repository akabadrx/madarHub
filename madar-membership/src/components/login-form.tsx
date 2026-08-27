"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/auth-actions";

const initialState: FormState = {};

export function LoginForm({ from }: { from: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form className="mp-form" action={formAction} noValidate>
      <input type="hidden" name="from" value={from} />

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

      <div className="field">
        <div className="mp-label-row">
          <label htmlFor="password">Password</label>
          <a href="/membership/forgot-password">Forgot password?</a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
        />
      </div>

      <label className="mp-check" htmlFor="remember">
        <input id="remember" name="remember" type="checkbox" defaultChecked />
        Keep me logged in
      </label>

      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
