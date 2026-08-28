"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/app/profile-actions";

const initialState: ProfileState = {};

export function ProfileForm({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string | null;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form className="mp-form" action={formAction} noValidate>
      {state.error ? (
        <p className="mp-alert error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mp-alert success" role="status">
          {state.success}
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
          defaultValue={state.values?.fullName ?? fullName}
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
          defaultValue={state.values?.phone ?? phone ?? ""}
          placeholder="078xxxxxxx"
        />
      </div>
      <p className="mp-hint">
        Needed for mobile money at checkout. We also use it to find your membership if your
        email is not on your Madar Hub record yet.
      </p>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" value={email} readOnly disabled />
      </div>
      <p className="mp-hint">
        Your email identifies your membership and is how you sign in, so it cannot be changed
        here. Message us on WhatsApp if you need it updated.
      </p>

      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
