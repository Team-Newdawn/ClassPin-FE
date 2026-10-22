"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "../_infrastructure/supabase/client";
import type { InsightReportView } from "../_model/insight-report";

export function useInsightReports() {
  const [reports, setReports] = useState<InsightReportView[]>([]);
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
      if (response.ok && !controller.signal.aborted) setReports((await response.json()).reports);
    };
    const update = () => { void refresh().catch(() => {}); };
    update(); window.addEventListener("focus", update);
    return () => { controller.abort(); window.removeEventListener("focus", update); };
  }, []);
  return reports;
}
