"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import {
  createCampaign as persistCampaign,
  fetchCampaignSnapshot,
  fetchLiveCampaign,
  fetchOwnedCampaigns,
  setPinHidden as persistPinHidden,
  submitPin,
  subscribeToCampaign,
  updateCampaign,
  updatePin as persistPinUpdate
} from "@/lib/pin/repository";
import type { Campaign, FeedbackCategory, FeedbackPin } from "@/lib/pin/types";

type Store = {
  ready: boolean;
  campaigns: Campaign[];
  createCampaign: (input: { title: string; guideText: string; imageFile: File }) => Promise<Campaign>;
  addPin: (campaignId: string, pin: Omit<FeedbackPin, "id" | "campaignId" | "authorId" | "hidden" | "createdAt">) => Promise<void>;
  updatePin: (campaignId: string, pinId: string, values: { category: FeedbackCategory; body: string }) => Promise<void>;
  setPinHidden: (campaignId: string, pinId: string, hidden: boolean) => Promise<void>;
  setStatus: (campaignId: string, status: Campaign["status"]) => Promise<void>;
  loadCampaignByCode: (code: string) => Promise<Campaign | null>;
};

const CampaignContext = createContext<Store | null>(null);

// 사람이 받아 적는 코드라 서로 헷갈리는 0/O, 1/I 는 뺀다.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

const dedupeById = (list: Campaign[]) => {
  const seen = new Set<string>();
  const unique = list.filter((campaign) => {
    if (seen.has(campaign.id)) return false;
    seen.add(campaign.id);
    return true;
  });
  return unique.length === list.length ? list : unique;
};

const errorDetail = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : String(error);
};

export function CampaignStore({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user, isAdmin } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ready, setReady] = useState(false);
  const lookups = useRef(new Map<string, Promise<Campaign | null>>());
  const ownerId = useRef<string | null>(null);
  const authUserId = user?.id ?? null;
  const authIsAnonymous = user?.is_anonymous ?? false;

  // 피드백 앱은 기준 이미지를 Storage 에 올려야 성립하므로 Supabase 모드만 지원한다.
  // DB 가 유일한 기준이고, 로컬 캐시는 두지 않는다.
  useEffect(() => {
    if (!supabaseConfigured) {
      queueMicrotask(() => setReady(true));
      return;
    }
    let active = true;
    if (authLoading) {
      queueMicrotask(() => { if (active) setReady(false); });
      return () => { active = false; };
    }
    if (authUserId && !authIsAnonymous && isAdmin) {
      ownerId.current = authUserId;
      queueMicrotask(() => { if (active) setReady(false); });
      void fetchOwnedCampaigns()
        .then((remote) => {
          if (!active) return;
          setCampaigns(dedupeById(remote));
          setReady(true);
        })
        .catch((error) => {
          if (!active) return;
          console.error(`Supabase campaign load failed: ${errorDetail(error)}`, error);
          setCampaigns([]);
          setReady(true);
        });
      return () => { active = false; };
    }

    // 로그아웃하거나 익명 참여자로 바뀌면 이전 관리자의 캠페인을 남겨두지 않는다.
    const hadOwner = Boolean(ownerId.current);
    ownerId.current = null;
    queueMicrotask(() => {
      if (!active) return;
      if (hadOwner) setCampaigns([]);
      setReady(true);
    });
    return () => { active = false; };
  }, [authIsAnonymous, authLoading, authUserId, isAdmin]);

  const subscriptionKey = [...new Set(campaigns.map((campaign) => campaign.id))].sort().join("|");
  useEffect(() => {
    if (!ready || !supabaseConfigured || !subscriptionKey) return;
    const tracked = [...new Map(campaigns.map((campaign) => [campaign.id, campaign])).values()];
    let active = true;
    const channels: NonNullable<ReturnType<typeof subscribeToCampaign>>[] = [];
    const asAudience = !authUserId || authIsAnonymous;
    const refresh = async (campaign: Campaign) => {
      try {
        const snapshot = await fetchCampaignSnapshot(campaign, asAudience);
        if (!active || !snapshot) return;
        setCampaigns((current) => current.map((item) => item.id === campaign.id ? { ...item, ...snapshot } : item));
      } catch (error) { console.error("Supabase realtime refresh failed", error); }
    };
    tracked.forEach((campaign) => {
      const channel = subscribeToCampaign(campaign.id, () => void refresh(campaign), asAudience);
      if (channel) channels.push(channel);
    });
    return () => {
      active = false;
      const client = getSupabaseClient();
      if (client) channels.forEach((channel) => void client.removeChannel(channel));
    };
    // 핀이 늘어난다고 구독을 다시 만들지 않는다. 캠페인 id 집합이 바뀔 때만 재구독한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subscriptionKey]);

  const updateCampaignState = useCallback((id: string, fn: (campaign: Campaign) => Campaign) => {
    setCampaigns((current) => current.map((campaign) => campaign.id === id ? fn(campaign) : campaign));
  }, []);

  const value = useMemo<Store>(() => ({
    ready,
    campaigns,
    createCampaign: async (input) => {
      const campaign = await persistCampaign({ id: crypto.randomUUID(), code: makeCode(), ...input });
      setCampaigns((current) => dedupeById([campaign, ...current]));
      return campaign;
    },
    addPin: async (campaignId, input) => {
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) throw new Error("피드백을 남길 캠페인을 찾지 못했습니다.");
      const draft: FeedbackPin = { ...input, id: crypto.randomUUID(), campaignId, authorId: null, hidden: false, createdAt: new Date().toISOString() };
      // 익명 세션은 제출 시점에 만들어질 수 있어, 실제 기록된 작성자 id 를 받아서 넣는다.
      const pin: FeedbackPin = { ...draft, authorId: await submitPin(campaign, draft) };
      updateCampaignState(campaignId, (current) => ({
        ...current,
        pins: current.pins.some((item) => item.id === pin.id)
          ? current.pins.map((item) => item.id === pin.id ? pin : item)
          : [pin, ...current.pins]
      }));
    },
    updatePin: async (campaignId, pinId, values) => {
      await persistPinUpdate(pinId, values);
      updateCampaignState(campaignId, (campaign) => ({
        ...campaign,
        pins: campaign.pins.map((pin) => pin.id === pinId ? { ...pin, ...values } : pin)
      }));
    },
    setPinHidden: async (campaignId, pinId, hidden) => {
      await persistPinHidden(pinId, hidden);
      updateCampaignState(campaignId, (campaign) => ({
        ...campaign,
        pins: campaign.pins.map((pin) => pin.id === pinId ? { ...pin, hidden } : pin)
      }));
    },
    setStatus: async (campaignId, status) => {
      await updateCampaign(campaignId, { status });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, status }));
    },
    loadCampaignByCode: async (code) => {
      const key = code.toLowerCase();
      const existing = campaigns.find((campaign) => campaign.code.toLowerCase() === key);
      if (existing) return existing;
      // campaigns 는 이 클로저가 만들어진 시점의 값이다. 같은 코드로 조회가 겹치면 (StrictMode 의
      // 이펙트 재실행, 재진입) 위 검사를 둘 다 통과해 같은 캠페인이 두 번 붙는다. 조회를 하나로 묶는다.
      const inflight = lookups.current.get(key);
      if (inflight) return inflight;
      const lookup = fetchLiveCampaign(code)
        .then((remote) => {
          if (remote) setCampaigns((current) => current.some((campaign) => campaign.id === remote.id) ? current : [remote, ...current]);
          return remote;
        })
        .finally(() => lookups.current.delete(key));
      lookups.current.set(key, lookup);
      return lookup;
    }
  }), [campaigns, ready, updateCampaignState]);

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaigns() {
  const value = useContext(CampaignContext);
  if (!value) throw new Error("useCampaigns must be used inside CampaignStore");
  return value;
}
