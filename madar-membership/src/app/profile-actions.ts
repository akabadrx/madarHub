"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { linkAccountToLeadIfPossible } from "@/app/checkout-actions";
import { normalizePhone } from "@/lib/utils";

export type ProfileState = {
  error?: string;
  success?: string;
  values?: Record<string, string>;
};

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(150),
  phone: z
    .string()
    .trim()
    .min(7, "Enter the phone number you use with Madar Hub.")
    .max(20, "That phone number looks too long."),
});

/**
 * Updates the member's own name and phone number.
 *
 * The phone is what connects an account to the CRM record staff keep, so
 * setting it here is also what unlocks online payment for members who signed up
 * with Google (whose profile carries no phone number at all).
 */
export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form.", values };
  }

  const phone = normalizePhone(parsed.data.phone);
  if (phone.length < 9) {
    return { error: "Enter a valid phone number, for example 0783 662 543.", values };
  }

  const db = getDb();
  const taken = await db.membershipUser.findUnique({ where: { phone }, select: { id: true } });
  if (taken && taken.id !== user.id) {
    return {
      error: "Another account already uses that phone number. Contact us on WhatsApp if that is yours.",
      values,
    };
  }

  await db.membershipUser.update({
    where: { id: user.id },
    data: { fullName: parsed.data.fullName.trim(), phone },
  });

  // A new or corrected number may now match the member's CRM record, which is
  // what makes their real status and payment history appear.
  const linkedNow = !user.leadId ? await linkAccountToLeadIfPossible(user.id, phone) : null;

  revalidatePath("/");
  revalidatePath("/profile");

  return {
    success: linkedNow
      ? "Saved. We found your Madar Hub membership and connected it to this account."
      : "Saved.",
  };
}
