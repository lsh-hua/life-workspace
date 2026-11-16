"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// 取消旧请求，避免快速录入后的新列表被较慢的旧响应覆盖。
export function useTaskResource<T>(path: string, initial: T, source: string, failure: string) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return api<T>(path, { signal: controller.signal }).then((rows) => {
      if (controller.signal.aborted) return;
      setData(rows);
      setLoaded(true);
      setError(null);
    }).catch(() => {
      if (!controller.signal.aborted) setError(failure);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
  }, [path, failure]);

  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);

  useEffect(() => {
    const update = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source !== source) void refresh();
    };
    window.addEventListener("workbench:records-changed", update);
    return () => window.removeEventListener("workbench:records-changed", update);
  }, [refresh, source]);

  return { data, setData, loading, loaded, error, setError, refresh };
}
