"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function PageWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-enter">
      {children}
    </div>
  );
}
