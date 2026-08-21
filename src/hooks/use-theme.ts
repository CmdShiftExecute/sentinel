"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

export type Palette = "operator" | "tech" | "forest" | "golden" | "sunset" | "galaxy";

export const PALETTES: { id: Palette; name: string; swatch: string }[] = [
  { id: "operator", name: "Operator Teal", swatch: "oklch(0.7 0.14 185)" },
  { id: "tech", name: "Tech Innovation", swatch: "oklch(0.62 0.18 258)" },
  { id: "forest", name: "Forest Canopy", swatch: "oklch(0.62 0.11 145)" },
  { id: "golden", name: "Golden Hour", swatch: "oklch(0.72 0.13 80)" },
  { id: "sunset", name: "Sunset Boulevard", swatch: "oklch(0.65 0.15 40)" },
  { id: "galaxy", name: "Midnight Galaxy", swatch: "oklch(0.63 0.12 300)" },
];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [palette, setPaletteState] = useState<Palette>("operator");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sentinel-theme") as Theme | null;
    const initial = stored || "dark";
    setThemeState(initial);
    document.documentElement.setAttribute("data-theme", initial);

    const storedPalette = localStorage.getItem("sentinel-palette") as Palette | null;
    const initialPalette =
      storedPalette && PALETTES.some((p) => p.id === storedPalette) ? storedPalette : "operator";
    setPaletteState(initialPalette);
    document.documentElement.setAttribute("data-palette", initialPalette);

    setMounted(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("sentinel-theme", t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setPalette = useCallback((p: Palette) => {
    setPaletteState(p);
    document.documentElement.setAttribute("data-palette", p);
    localStorage.setItem("sentinel-palette", p);
  }, []);

  return { theme, setTheme, toggle, palette, setPalette, mounted };
}
