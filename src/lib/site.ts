// Everything you'd edit to rebrand or re-price the business lives here.
export const SITE = {
  name: "JAY_AESTHETIX",
  tagline: "Personal Training & Fitness",
  trainerName: "Jay",
  location: "Decatur, GA",
  studioTimezone: "America/New_York",
  sessionMinutes: 60,
  minLeadHours: 2, // can't book a slot that starts sooner than this
  cancelWindowHours: 12, // clients can't cancel inside this window
  email: "hello@jayaesthetix.test",
  instagram: "@jay_aesthetix",
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
};

// Sample pricing for the portfolio concept: swap in real numbers when you go live.
export const PACKAGES = [
  {
    name: "Intro Session",
    price: "Free",
    unit: "45 min",
    blurb: "Meet, talk goals, and try a real workout. No pressure.",
    features: ["Goal & movement assessment", "Sample workout", "Custom plan outline"],
    featured: false,
  },
  {
    name: "8-Session Pack",
    price: "$440",
    unit: "$55 / session",
    blurb: "The most popular way to build momentum with a coach beside you.",
    features: ["8 one-on-one sessions", "Progress tracking in your portal", "Form coaching & programming"],
    featured: true,
  },
  {
    name: "Monthly Coaching",
    price: "$320",
    unit: "per month",
    blurb: "Ongoing coaching for people who want accountability and results.",
    features: ["2 sessions per week", "Monthly check-in & plan reset", "Priority booking"],
    featured: false,
  },
];

export const STEPS = [
  { title: "Book a free intro", text: "Create your account and tell me your goals, history, and schedule." },
  { title: "Get your plan", text: "We build a program around your body, your goals, and your week." },
  { title: "Train and track", text: "Book sessions online and watch your numbers move in your dashboard." },
];

export const FAQ = [
  { q: "I've never trained before. Is that okay?", a: "Absolutely. Most of my clients start as beginners. Every plan begins with where you are today." },
  { q: "Where do sessions happen?", a: "Sessions are held at a partner gym in the Decatur area. Details are confirmed when you book." },
  { q: "What if I need to cancel?", a: `You can cancel online up to ${SITE.cancelWindowHours} hours before a session. Inside that window, message me directly.` },
  { q: "How do payments work?", a: "I send an invoice for your package. You can see every invoice and its status in your client portal." },
];

export const CREDENTIALS = ["ACE Certified Personal Trainer", "Red Cross First Aid / CPR / AED"];
