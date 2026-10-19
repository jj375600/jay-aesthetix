import { AppNav } from "@/components/AppNav";
import { Footer } from "@/components/Footer";
import { requireUser } from "@/lib/auth";

// Everything under (app) needs a logged-in user and always reads fresh data.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppNav role={user.role} name={user.name} />
      <main className="container page">{children}</main>
      <Footer />
    </>
  );
}
