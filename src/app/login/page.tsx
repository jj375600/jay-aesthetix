import { Suspense } from "react";
import { SiteNav } from "@/components/SiteNav";
import { AuthForm } from "@/components/AuthForm";
import { Footer } from "@/components/Footer";
import { SITE } from "@/lib/site";

export const metadata = { title: `Log in · ${SITE.name}` };

export default function LoginPage() {
  return (
    <>
      <SiteNav />
      <main className="container">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
        {SITE.demoMode && (
          <div className="card narrow" style={{ marginBottom: 40 }}>
            <strong>Demo accounts</strong> (password <code>demo1234</code>)
            <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              <li>Trainer: <code>jay@jayaesthetix.test</code></li>
              <li>Client: <code>maya@example.test</code></li>
            </ul>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
