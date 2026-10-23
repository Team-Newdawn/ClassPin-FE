"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../_infrastructure/supabase/client";
import type { InsightReportView } from "../_model/insight-report";

// The last list survives client-side navigation, so report icons render at once and the fetch below only refreshes them.
// Reports only match the signed-in owner's own materials, so a stale list from another account matches nothing.
let lastReports: InsightReportView[] = [];

export function useInsightReports() {
  const [reports, setReports] = useState(lastReports);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      const client = getSupabaseClient();
      if (!client) return;
      const { data } = await client.auth.getSession();
      if (!data.session) return;
      const response = await fetch("/api/admin/ai-reports", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store", signal: controller.signal,
      });
      if (response.ok && !controller.signal.aborted) setReports(lastReports = (await response.json()).reports);
    };
    const update = () => { void refresh().catch(() => {}); };
    update(); window.addEventListener("focus", update);
    return () => { controller.abort(); window.removeEventListener("focus", update); };
  }, []);
  return reports;
}
