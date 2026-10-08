import { z } from "zod"

const email = z.email("Enter a valid email address.").trim().toLowerCase()

// Supabase (bcrypt) ignores anything past 72 bytes.
const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
})

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  email,
  password: newPassword,
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  })
