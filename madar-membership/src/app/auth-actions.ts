"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hashPassword, hashToken, verifyPassword } from "@/lib/password";
import { endSession, startSession } from "@/lib/session";
import { findLeadByPhone } from "@/lib/crm";
import { emailLayout, sendEmail } from "@/lib/mail";
import { normalizeEmail, normalizePhone } from "@/lib/utils";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation";

export type FormState = {
  error?: string;
  success?: string;
  values?: Record<string, string>;
};

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Only internal absolute paths, so ?from= cannot be used as an open redirect. */
function safeFrom(value: string | null): string {
  if (!value) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function firstError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}

// ------------------------------------------------------------------ login --

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({
    email,
    password: String(formData.get("password") ?? ""),
    remember: formData.get("remember") === "on",
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error), values: { email } };
  }

  const db = getDb();
  const user = await db.membershipUser.findUnique({
    where: { email: normalizeEmail(parsed.data.email) },
  });

  const passwordOk = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    // One message for a wrong password and for an address with no account, so
    // the form cannot be used to discover who is a member.
    return {
      error: "That email and password combination is not correct.",
      values: { email },
    };
  }

  if (user.disabledAt) {
    return {
      error: "This account has been disabled. Please contact Madar Hub on WhatsApp.",
      values: { email },
    };
  }

  await db.membershipUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await startSession(user.id, parsed.data.remember);

  redirect(safeFrom(String(formData.get("from") ?? "/")));
}

// ----------------------------------------------------------------- signup --

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };

  const parsed = signupSchema.safeParse({
    ...values,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error), values };
  }

  const db = getDb();
  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhone(parsed.data.phone);

  if (phone.length < 9) {
    return { error: "Enter a valid phone number, for example 0783 662 543.", values };
  }

  const [emailTaken, phoneTaken] = await Promise.all([
    db.membershipUser.findUnique({ where: { email }, select: { id: true } }),
    db.membershipUser.findUnique({ where: { phone }, select: { id: true } }),
  ]);

  if (emailTaken) {
    return { error: "An account with this email already exists. Log in instead.", values };
  }
  if (phoneTaken) {
    return { error: "An account with this phone number already exists. Log in instead.", values };
  }

  // Connect the new account to the record staff already keep for this person,
  // so an existing member sees their real status and payment history straight
  // away instead of an empty account. Someone with no history still gets an
  // account, they simply have no membership on it yet.
  const lead = await findLeadByPhone(phone);
  let leadId: string | null = null;
  if (lead) {
    const alreadyClaimed = await db.membershipUser.findUnique({
      where: { leadId: lead.id },
      select: { id: true },
    });
    if (!alreadyClaimed) leadId = lead.id;
  }

  const user = await db.membershipUser.create({
    data: {
      email,
      phone,
      fullName: parsed.data.fullName.trim(),
      passwordHash: await hashPassword(parsed.data.password),
      leadId,
    },
    select: { id: true },
  });

  await startSession(user.id, true);
  redirect("/");
}

// ----------------------------------------------------------------- logout --

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

// --------------------------------------------------------- password reset --

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: { email } };
  }

  // Always the same answer, whether or not the account exists, otherwise this
  // form becomes a way to test which email addresses belong to members.
  const confirmation =
    "If that email address has a Madar Hub account, a reset link is on its way. It expires in one hour.";

  const db = getDb();
  const user = await db.membershipUser.findUnique({
    where: { email: normalizeEmail(parsed.data.email) },
    select: { id: true, fullName: true, email: true, disabledAt: true },
  });

  if (!user || user.disabledAt) return { success: confirmation };

  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://madarorbit.com/membership";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  const firstName = user.fullName.split(" ")[0] || "there";

  const { sent } = await sendEmail({
    to: user.email,
    subject: "Reset your Madar Hub password",
    html: emailLayout(
      "Reset your password",
      `<p style="color:#3B4B5E;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
         Hi ${firstName}, we received a request to reset the password on your Madar Hub
         membership account. This link expires in one hour.
       </p>
       <a href="${resetUrl}" style="display:inline-block;background:#D6A84F;color:#071A2D;font-weight:700;font-size:15px;padding:12px 26px;border-radius:999px;text-decoration:none;">Choose a new password</a>
       <p style="color:#667085;font-size:13px;line-height:1.6;margin:24px 0 0 0;">
         If you did not ask for this, you can ignore this email and your password stays as it is.
       </p>`,
    ),
  });

  // With no mail provider configured nothing was delivered, and the member has
  // no way to continue. Print the link so an admin can pass it on and so the
  // flow is testable before Resend is set up. This only happens in a state
  // where password reset is already broken; once RESEND_API_KEY is set, the
  // link is never written to the logs.
  if (!sent) {
    console.warn(
      `[password-reset] Email not sent (no RESEND_API_KEY). Link for ${user.email}: ${resetUrl}`,
    );
  }

  return { success: confirmation };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const db = getDb();
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: { id: true, userId: true, expiresAt: true, consumedAt: true },
  });

  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    return { error: "That reset link has expired or has already been used. Request a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction([
    db.membershipUser.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Consume this link and invalidate any other outstanding ones for the account.
    db.passwordResetToken.updateMany({
      where: { userId: record.userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);

  await startSession(record.userId, false);
  redirect("/");
}
