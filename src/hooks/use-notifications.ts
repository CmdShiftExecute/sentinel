"use client";

import useSWR from "swr";
import type { NotificationsPayload } from "@/lib/notifications.server";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/** Shared by the bell, the tray and the page (same SWR key, one request).
 *  On a failed refresh SWR keeps the last good data, so the list never blanks. */
export function useNotifications(refreshInterval = 30_000) {
  const { data, error, isLoading, mutate } = useSWR<NotificationsPayload>("/api/notifications", fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markRead" }),
    });
    await mutate();
  }

  return { data, error, isLoading, refresh: mutate, markAllRead };
}
