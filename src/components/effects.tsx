"use client";

import { useEffect, useState } from "react";

// Cursor spotlight: one delegated listener drives --mx/--my on the hovered
// card via rAF. No React state — pointer position never touches the tree.
// Covers .card-static as well, so tables and panels catch the light too.
//
// The light's RADIUS is derived from the element rather than fixed in pixels.
// A single fixed size cannot work across this UI: the same 480px circle that
// reads as a spotlight on a 1150px panel is wider than a 190px gauge card, so
// the whole card sits inside the bright core and the light appears not to track
// the pointer at all. Scaling to the card's SHORTER side keeps the lit area a
// consistent fraction of whatever it is lighting.
const SPOT_MIN = 60;   // px — below this the light is too small to read
const SPOT_MAX = 220;  // px — above this it stops being a spotlight on big panels
const SPOT_RATIO = 0.55;

export function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return; // touch devices

    let raf = 0;
    let lastEvent: PointerEvent | null = null;
    let current: HTMLElement | null = null;

    const apply = () => {
      raf = 0;
      const e = lastEvent;
      if (!e) return;
      const card = (e.target as Element | null)?.closest?.(".card, .card-static") as HTMLElement | null;
      if (card) {
        const r = card.getBoundingClientRect();
        // Radius is recomputed only when the pointer moves onto a different
        // card, not on every frame — the size cannot change between frames of
        // one hover, and writing it 60 times a second would be pure waste.
        if (card !== current) {
          current = card;
          const radius = Math.max(SPOT_MIN, Math.min(SPOT_MAX, Math.min(r.width, r.height) * SPOT_RATIO));
          card.style.setProperty("--spot-r", `${Math.round(radius)}px`);
        }
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      } else {
        current = null;
      }
    };

    const onMove = (e: PointerEvent) => {
      lastEvent = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}

// One scan-line sweep on the first load of a browser session.
export function BootSweep() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("sentinel-booted")) return;
    sessionStorage.setItem("sentinel-booted", "1");
    setShow(true);
    const t = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  return <div className="boot-sweep" aria-hidden="true" />;
}
