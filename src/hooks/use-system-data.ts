"use client";

import useSWR from "swr";
import type { SystemData } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSystemData(refreshInterval = 10_000) {
  const { data, error, isLoading, mutate } = useSWR<SystemData>(
    "/api/system",
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
    }
  );

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  };
}
