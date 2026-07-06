"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_COOKIE_PATH } from "@/lib/auth";

export async function logout() {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_PATH });
  redirect("/login");
}
