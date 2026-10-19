import Link from "next/link";
import { SITE } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="brand" aria-label={`${SITE.name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/img/logo-sm.png" alt="" width={44} height={44} />
      <span>{SITE.name}</span>
    </Link>
  );
}
