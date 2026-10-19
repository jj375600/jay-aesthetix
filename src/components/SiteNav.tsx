import Link from "next/link";
import { Logo } from "./Logo";
import { getUser } from "@/lib/auth";

export async function SiteNav() {
  const user = await getUser();
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Logo />
        <nav className="navlinks" aria-label="Main">
          <a href="/#services">Services</a>
          <a href="/#how">How it works</a>
          <a href="/#about">About</a>
          <a href="/#faq">FAQ</a>
          {user ? (
            <Link href="/dashboard" className="btn btn-primary btn-sm">My dashboard</Link>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/register" className="btn btn-primary btn-sm">Book free intro</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
