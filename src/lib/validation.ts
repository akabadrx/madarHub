import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-constants";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean().default(false),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(150),
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .min(7, "Enter the phone number you use with Madar Hub.")
    .max(20, "That phone number looks too long."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(200, "That password is too long."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(200, "That password is too long."),
});
