"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { getAudienceSupabaseClient, getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import {
  createSessionFolder as persistSessionFolder,
  createCampaign as persistCampaign,
  deleteCampaign as persistCampaignDeletion,
  deleteSessionFolder as persistSessionFolderDeletion,
  fetchCampaignSnapshot,
  fetchCampaignStatus,
  fetchLiveCampaign,
  fetchOwnedCampaigns,
  fetchOwnedSessionFolders,
  moveCampaignToFolder as persistCampaignFolder,
  renameSessionFolder as persistSessionFolderName,
  setPinHidden as persistPinHidden,
  setPinReaction as persistPinReaction,
  submitPin,
  subscribeToCampaign,
  updateCampaign,
  updateCampaignAudienceGroups as persistAudienceGroups,
  updateCampaignPageAudienceGroups as persistPageAudienceGroups,
  updatePin as persistPinUpdate
} from "@/lib/pin/repository";
import { mergeAudiencePages, type Campaign, type FeedbackCategory, type FeedbackCategorySettings, type FeedbackPin, type FeedbackPinMarker, type SessionFolder } from "@/lib/pin/types";
import { withPinReaction } from "@/lib/pin/empathy";

type Store = {
  ready: boolean;
  campaigns: Campaign[];
  folders: SessionFolder[];
  createCampaign: (input: { title: string; guideText: string; referenceFile: File }) => Promise<Campaign>;
  deleteCampaign: (campaignId: string) => Promise<void>;
  createFolder: (name: string) => Promise<SessionFolder>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveCampaign: (campaignId: string, folderId: string | null) => Promise<void>;
  addPin: (campaignId: string, pin: Omit<FeedbackPin, "id" | "campaignId" | "authorId" | "reactionCount" | "reactedByMe" | "hidden" | "createdAt">) => Promise<void>;
  updatePin: (campaignId: string, pinId: string, values: { category: FeedbackCategory; body: string; marker: FeedbackPinMarker }) => Promise<void>;
  setPinReaction: (campaignId: string, pinId: string, reacted: boolean) => Promise<boolean>;
  setPinHidden: (campaignId: string, pinId: string, hidden: boolean) => Promise<void>;
  setAudienceGroups: (campaignId: string, audienceGroups: string[]) => Promise<void>;
  setPageAudienceGroups: (campaignId: string, pageId: string, audienceGroups: string[]) => Promise<void>;
  setStatus: (campaignId: string, status: Campaign["status"]) => Promise<void>;
  setShowPresentationQr: (campaignId: string, visible: boolean) => Promise<void>;
  setPresentationQrPosition: (campaignId: string, position: Campaign["presentationQrPosition"]) => Promise<void>;
  setPresentationAutoplay: (campaignId: string, enabled: boolean) => Promise<void>;
  setShowPresentationPinStatus: (campaignId: string, visible: boolean) => Promise<void>;
  setPresentationPinStatusPosition: (campaignId: string, position: Campaign["presentationPinStatusPosition"]) => Promise<void>;
  setFeedbackCategories: (campaignId: string, settings: FeedbackCategorySettings) => Promise<void>;
  loadCampaignByCode: (code: string, audienceGroup: string | null) => Promise<Campaign | null>;
};

const CampaignContext = createContext<Store | null>(null);
const PARTICIPANT_STATUS_POLL_MS = 2_000;

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
  const [folders, setFolders] = useState<SessionFolder[]>([]);
  const [ready, setReady] = useState(false);
  const lookups = useRef(new Map<string, Promise<Campaign | null>>());
  const ownerId = useRef<string | null>(null);
  const campaignsRef = useRef<Campaign[]>([]);
  const authUserId = user?.id ?? null;
  const authIsAnonymous = user?.is_anonymous ?? false;

  useEffect(() => { campaignsRef.current = campaigns; }, [campaigns]);

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
      void Promise.all([fetchOwnedCampaigns(), fetchOwnedSessionFolders()])
        .then(([remote, remoteFolders]) => {
          if (!active) return;
          setCampaigns(dedupeById(remote));
          setFolders(remoteFolders);
          setReady(true);
        })
        .catch((error) => {
          if (!active) return;
          console.error(`Supabase campaign load failed: ${errorDetail(error)}`, error);
          setCampaigns([]);
          setFolders([]);
          setReady(true);
        });
      return () => { active = false; };
    }

    // 로그아웃하거나 익명 참여자로 바뀌면 이전 관리자의 캠페인을 남겨두지 않는다.
    const hadOwner = Boolean(ownerId.current);
    ownerId.current = null;
    queueMicrotask(() => {
      if (!active) return;
      if (hadOwner) {
        setCampaigns([]);
        setFolders([]);
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [authIsAnonymous, authLoading, authUserId, isAdmin]);

  const subscriptionKey = [...new Set(campaigns.map((campaign) => campaign.id))].sort().join("|");
  useEffect(() => {
    if (!ready || !supabaseConfigured || !subscriptionKey) return;
    const tracked = [...new Map(campaigns.map((campaign) => [campaign.id, campaign])).values()];
    let active = true;
    let statusPoll: ReturnType<typeof setInterval> | null = null;
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
    if (asAudience) {
      statusPoll = setInterval(() => {
        tracked.forEach((campaign) => {
          const latestCampaign = campaignsRef.current.find((item) => item.id === campaign.id) ?? campaign;
          void fetchCampaignStatus(latestCampaign, true)
            .then((status) => {
              if (!active) return;
              setCampaigns((current) => current.map((item) => item.id === campaign.id && item.status !== status ? { ...item, status } : item));
            })
            .catch((error) => console.error("Supabase campaign status refresh failed", error));
        });
      }, PARTICIPANT_STATUS_POLL_MS);
    }
    return () => {
      active = false;
      if (statusPoll) clearInterval(statusPoll);
      const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
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
    folders,
    createCampaign: async (input) => {
      const campaign = await persistCampaign({ id: crypto.randomUUID(), code: makeCode(), ...input });
      setCampaigns((current) => dedupeById([campaign, ...current]));
      return campaign;
    },
    deleteCampaign: async (campaignId) => {
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) throw new Error("삭제할 세션을 찾지 못했습니다.");
      await persistCampaignDeletion(campaign);
      setCampaigns((current) => current.filter((item) => item.id !== campaignId));
    },
    createFolder: async (name) => {
      const folder = await persistSessionFolder(name);
      setFolders((current) => [...current, folder]);
      return folder;
    },
    renameFolder: async (folderId, name) => {
      await persistSessionFolderName(folderId, name);
      setFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, name } : folder));
    },
    deleteFolder: async (folderId) => {
      await persistSessionFolderDeletion(folderId);
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      setCampaigns((current) => current.map((campaign) => campaign.folderId === folderId ? { ...campaign, folderId: null } : campaign));
    },
    moveCampaign: async (campaignId, folderId) => {
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) throw new Error("이동할 세션을 찾지 못했습니다.");
      if (folderId !== null && !folders.some((folder) => folder.id === folderId)) throw new Error("이동할 폴더를 찾지 못했습니다.");
      if (campaign.folderId === folderId) return;
      await persistCampaignFolder(campaignId, folderId);
      updateCampaignState(campaignId, (current) => ({ ...current, folderId }));
    },
    addPin: async (campaignId, input) => {
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) throw new Error("피드백을 남길 세션을 찾지 못했습니다.");
      const draft: FeedbackPin = { ...input, id: crypto.randomUUID(), campaignId, authorId: null, reactionCount: 0, reactedByMe: false, hidden: false, createdAt: new Date().toISOString() };
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
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) throw new Error("피드백을 고칠 세션을 찾지 못했습니다.");
      await persistPinUpdate(campaign, pinId, values);
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
    setPinReaction: async (campaignId, pinId, reacted) => {
      if (!campaigns.some((campaign) => campaign.id === campaignId)) throw new Error("공감할 세션을 찾지 못했습니다.");
      const reactedByMe = await persistPinReaction(pinId, reacted);
      updateCampaignState(campaignId, (campaign) => ({
        ...campaign,
        pins: campaign.pins.map((pin) => pin.id === pinId ? withPinReaction(pin, reactedByMe) : pin)
      }));
      return reactedByMe;
    },
    setAudienceGroups: async (campaignId, audienceGroups) => {
      await persistAudienceGroups(campaignId, audienceGroups);
      updateCampaignState(campaignId, (campaign) => ({
        ...campaign,
        audienceGroups,
        pages: campaign.pages.map((page) => ({
          ...page,
          audienceGroups: page.audienceGroups.filter((group) => audienceGroups.includes(group))
        }))
      }));
    },
    setPageAudienceGroups: async (campaignId, pageId, audienceGroups) => {
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign || audienceGroups.some((group) => !campaign.audienceGroups.includes(group))) {
        throw new Error("세션에 없는 참여자 그룹입니다.");
      }
      await persistPageAudienceGroups(pageId, audienceGroups);
      updateCampaignState(campaignId, (campaign) => ({
        ...campaign,
        pages: campaign.pages.map((page) => page.id === pageId ? { ...page, audienceGroups } : page)
      }));
    },
    setStatus: async (campaignId, status) => {
      await updateCampaign(campaignId, { status });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, status }));
    },
    setShowPresentationQr: async (campaignId, visible) => {
      await updateCampaign(campaignId, { show_presentation_qr: visible });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, showPresentationQr: visible }));
    },
    setPresentationQrPosition: async (campaignId, position) => {
      await updateCampaign(campaignId, { presentation_qr_position: position });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, presentationQrPosition: position }));
    },
    setPresentationAutoplay: async (campaignId, enabled) => {
      await updateCampaign(campaignId, { presentation_autoplay: enabled });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, presentationAutoplay: enabled }));
    },
    setShowPresentationPinStatus: async (campaignId, visible) => {
      await updateCampaign(campaignId, { show_presentation_pin_status: visible });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, showPresentationPinStatus: visible }));
    },
    setPresentationPinStatusPosition: async (campaignId, position) => {
      await updateCampaign(campaignId, { presentation_pin_status_position: position });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, presentationPinStatusPosition: position }));
    },
    setFeedbackCategories: async (campaignId, feedbackCategories) => {
      await updateCampaign(campaignId, { feedback_categories: feedbackCategories });
      updateCampaignState(campaignId, (campaign) => ({ ...campaign, feedbackCategories }));
    },
    loadCampaignByCode: async (code, audienceGroup) => {
      const key = `${code.toLowerCase()}:${audienceGroup ?? "metadata"}`;
      // campaigns 는 이 클로저가 만들어진 시점의 값이다. 같은 코드로 조회가 겹치면 (StrictMode 의
      // 이펙트 재실행, 재진입) 같은 요청이 겹친다. 유형까지 포함한 키로 조회를 하나로 묶는다.
      const inflight = lookups.current.get(key);
      if (inflight) return inflight;
      const lookup = fetchLiveCampaign(code, audienceGroup)
        .then((remote) => {
          if (remote) setCampaigns((current) => {
            const existing = current.find((campaign) => campaign.id === remote.id);
            if (!existing) return [remote, ...current];
            return current.map((campaign) => campaign.id === remote.id ? {
              ...campaign,
              ...remote,
              pages: audienceGroup
                ? mergeAudiencePages(campaign.pages, remote.pages, audienceGroup)
                : remote.audienceGroups.length ? campaign.pages : remote.pages
            } : campaign);
          });
          return remote;
        })
        .finally(() => lookups.current.delete(key));
      lookups.current.set(key, lookup);
      return lookup;
    }
  }), [campaigns, folders, ready, updateCampaignState]);

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaigns() {
  const value = useContext(CampaignContext);
  if (!value) throw new Error("useCampaigns must be used inside CampaignStore");
  return value;
}
