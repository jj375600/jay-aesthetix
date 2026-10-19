import { Suspense } from "react";
import { SiteNav } from "@/components/SiteNav";
import { AuthForm } from "@/components/AuthForm";
import { Footer } from "@/components/Footer";
import { SITE } from "@/lib/site";

export const metadata = { title: `Create account · ${SITE.name}` };

export default function RegisterPage() {
  return (
    <>
      <SiteNav />
      <main className="container">
        <Suspense>
          <AuthForm mode="register" />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
