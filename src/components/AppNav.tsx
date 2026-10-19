"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";

type Props = { role: "trainer" | "client"; name: string };

const LINKS = {
  trainer: [
    ["/dashboard", "Dashboard"],
    ["/clients", "Clients"],
    ["/availability", "Availability"],
    ["/invoices", "Invoices"],
  ],
  client: [
    ["/dashboard", "Dashboard"],
    ["/book", "Book"],
    ["/progress", "Progress"],
    ["/invoices", "Invoices"],
  ],
} as const;

export function AppNav({ role, name }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Logo />
        <nav className="navlinks" aria-label="App">
          {LINKS[role].map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(href + "/") ? "page" : undefined}>
              {label}
            </Link>
          ))}
          <span className="muted" style={{ padding: "0 8px", fontSize: ".9rem" }}>{name}</span>
          <button className="linklike" onClick={logout}>Log out</button>
        </nav>
      </div>
    </header>
  );
}
