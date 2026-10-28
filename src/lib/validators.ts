import { z } from "zod";
import { normalizePhone } from "./phone";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const onboardingSchema = z.object({
  phone: z.string().trim().max(30).optional().default(""),
  smsConsent: z.boolean().optional().default(false),
  goal: z.string().trim().min(5, "Tell me a bit more about your goal").max(500),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  targetWeight: z.coerce.number().min(50).max(600).nullable().optional(),
  injuries: z.string().trim().max(500).optional().default(""),
  medicalNotes: z.string().trim().max(500).optional().default(""),
  parQFlags: z.array(z.string().max(100)).max(10).default([]),
  sessionsPerWeek: z.coerce.number().int().min(1).max(7),
  preferredDays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).min(1, "Pick at least one day"),
  preferredTime: z.enum(["morning", "afternoon", "evening", "any"]),
}).superRefine((d, ctx) => {
  // Texting someone needs a number we can actually text. Without the box ticked, the phone stays free text as before.
  if (d.smsConsent && !normalizePhone(d.phone)) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid mobile number to get text messages (US numbers work as 404-555-0123)" });
  }
});

export const bookingSchema = z.object({
  date,
  time,
  type: z.string().trim().max(60).optional().default("Strength training"),
  clientId: z.coerce.number().int().positive().optional(), // trainers can book on behalf of a client
});

export const sessionPatchSchema = z.object({
  status: z.enum(["cancelled", "completed"]),
  notes: z.string().trim().max(500).optional(),
});

const optionalNum = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(min).max(max).nullable());

export const progressSchema = z
  .object({
    clientId: z.coerce.number().int().positive().optional(),
    entryDate: date,
    weightLb: optionalNum(50, 700),
    bodyFatPct: optionalNum(2, 70),
    benchLb: optionalNum(0, 1000),
    squatLb: optionalNum(0, 1500),
    deadliftLb: optionalNum(0, 1500),
    note: z.string().trim().max(300).optional().default(""),
  })
  .refine((v) => [v.weightLb, v.bodyFatPct, v.benchLb, v.squatLb, v.deadliftLb].some((x) => x !== null), {
    message: "Enter at least one measurement",
  });

export const invoiceSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  description: z.string().trim().min(3, "Add a description").max(120),
  amount: z.coerce.number().positive("Amount must be more than 0").max(10000),
  dueDate: date,
});

export const invoicePatchSchema = z.object({ status: z.enum(["sent", "paid", "void"]) });

export const availabilitySchema = z.object({
  blocks: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        start: time,
        end: time,
      })
    )
    .max(40),
});
