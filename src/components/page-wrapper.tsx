"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useLayoutEffect, useRef } from "react";

type RevealDir = "left" | "right" | "rise";

// Entrance choreography: "the console assembles itself".
// Direction comes from a card's column position (left third slides in from
// the left, right third from the right, center and full-width cards rise).
// Timing comes from rows: each visible row starts 120ms after the previous,
// sides land first and the row's rising cards settle 90ms later, so
// converging pairs arrive together instead of a flat left-to-right sweep.
// Above-the-fold cards intersect on mount (the load cascade); everything
// below reveals the same way as it scrolls into view.
export function PageWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(".card, .card-static"));
    if (targets.length === 0) return;

    const rootRect = root.getBoundingClientRect();
    const dirFor = (el: HTMLElement): RevealDir => {
      const r = el.getBoundingClientRect();
      if (rootRect.width === 0 || r.width / rootRect.width > 0.7) return "rise";
      const rel = (r.left + r.width / 2 - rootRect.left) / rootRect.width;
      if (rel < 0.4) return "left";
      if (rel > 0.6) return "right";
      return "rise";
    };

    const io = new IntersectionObserver(
      (entries) => {
        const batch = entries.filter((e) => e.isIntersecting);
        if (batch.length === 0) return;

        // Cluster the batch into rows by top edge (12px tolerance)
        const tops: number[] = [];
        const rowOf = (top: number) => {
          const found = tops.findIndex((t) => Math.abs(t - top) < 12);
          if (found !== -1) return found;
          tops.push(top);
          return tops.length - 1;
        };
        const sorted = batch
          .map((e) => e.target as HTMLElement)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

        sorted.forEach((el) => {
          const dir = (el.dataset.reveal as RevealDir) || "rise";
          const row = rowOf(el.getBoundingClientRect().top);
          const delay = Math.min(row * 120, 600) + (dir === "rise" ? 90 : 0);
          el.style.setProperty("--reveal-delay", `${delay}ms`);
          el.classList.remove("reveal-pending");
          el.classList.add(`reveal-in-${dir}`);
          io.unobserve(el);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );

    targets.forEach((t) => {
      t.dataset.reveal = dirFor(t);
      t.classList.add("reveal-pending");
      io.observe(t);
    });
    return () => io.disconnect();
  }, [pathname]);

  return (
    <div key={pathname} ref={ref} className="animate-page-enter">
      {children}
    </div>
  );
}
