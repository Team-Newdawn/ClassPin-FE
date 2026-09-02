"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { buildSessionInsights } from "@/app/_model/stats";

export function useInsightsController() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const { sessions, ready } = useSessions();
  const [scope, setScope] = useState("all");
  const scoped = useMemo(() => scope === "all" ? sessions : sessions.filter((session) => session.id === scope), [scope, sessions]);
  const insights = useMemo(() => buildSessionInsights(scoped, defaultCategoryLabel), [defaultCategoryLabel, scoped]);

  return {
    t,
    timeAgo,
    ready,
    scope,
    setScope,
    scopeOptions: sessions.slice(0, 4),
    ...insights,
    improvementCandidates: insights.hotspots.filter((item) => item.count >= 2).slice(0, 4)
  };
}
