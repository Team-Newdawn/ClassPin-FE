"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { PinAdminShell } from "@/components/pin/admin-shell";
import { useCampaigns } from "@/components/pin/campaign-store";
import { Check, Clock3, Copy, Grid2X2, Link2, Plus, Search, Share2, Upload, Users, X } from "@/components/icons";
import { useLanguage } from "@/components/language-context";
import type { Campaign } from "@/lib/pin/types";

type Filter = "all" | Campaign["status"];

const filterLabel: Record<Filter, string> = { all: "전체", live: "받는 중", ended: "마감" };
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 10 * 1024 * 1024;

function imageValidationError(file: File) {
  if (!acceptedImageTypes.has(file.type)) return "JPG, PNG, WEBP 이미지만 올릴 수 있어요.";
  if (file.size > maxImageBytes) return "이미지는 10MB 이하만 올릴 수 있어요.";
  return null;
}

export default function PinAdminPage() {
  const { timeAgo } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const { ready, campaigns, createCampaign } = useCampaigns();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sharedCampaign, setSharedCampaign] = useState<Campaign | null>(null);
  const [title, setTitle] = useState("");
  const [guideText, setGuideText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesFilter = filter === "all" || campaign.status === filter;
      const matchesQuery = !normalizedQuery || `${campaign.title} ${campaign.code}`.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [campaigns, filter, query]);

  const liveCount = campaigns.filter((campaign) => campaign.status === "live").length;
  const pinCount = campaigns.reduce((sum, campaign) => sum + campaign.pins.length, 0);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const replaceImage = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = file ? URL.createObjectURL(file) : "";
    previewUrlRef.current = nextPreviewUrl;
    setImageFile(file);
    setPreviewUrl(nextPreviewUrl);
  };

  const resetCreateForm = () => {
    setTitle("");
    setGuideText("");
    replaceImage(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeCreate = () => {
    if (submitting) return;
    setCreateOpen(false);
    resetCreateForm();
  };

  const pickImage = (file?: File) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    const error = imageValidationError(file);
    if (error) {
      replaceImage(null);
      setFormError(error);
      return;
    }
    replaceImage(file);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanGuideText = guideText.trim();
    if (!cleanTitle) {
      setFormError("캠페인 제목을 입력해 주세요.");
      return;
    }
    if (cleanTitle.length > 120) {
      setFormError("캠페인 제목은 120자 이내로 입력해 주세요.");
      return;
    }
    if (cleanGuideText.length > 300) {
      setFormError("안내문은 300자 이내로 입력해 주세요.");
      return;
    }
    if (!imageFile) {
      setFormError("기준 이미지를 선택해 주세요.");
      return;
    }
    const imageError = imageValidationError(imageFile);
    if (imageError) {
      setFormError(imageError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const campaign = await createCampaign({ title: cleanTitle, guideText: cleanGuideText, imageFile });
      router.push(`/pin/admin/${campaign.id}`);
    } catch (error) {
      console.error("Campaign creation failed", error);
      setFormError("캠페인을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setSubmitting(false);
    }
  };

  const openCampaign = (campaign: Campaign) => router.push(`/pin/admin/${campaign.id}`);
  const openCampaignWithKeyboard = (event: KeyboardEvent<HTMLElement>, campaign: Campaign) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openCampaign(campaign);
  };

  const joinUrl = sharedCampaign && typeof window !== "undefined"
    ? `${window.location.origin}/pin/join/${sharedCampaign.code}`
    : "";
  const copyJoinUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Campaign join link copy failed", error);
    }
  };

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  return (
    <PinAdminShell>
      <div className="admin-page">
        <div className="page-head">
          <div><h1>피드백 캠페인</h1><p>포스터·운영표·화면 위에 모인 피드백을 한눈에 관리하세요.</p></div>
          <div className="page-actions"><button className="btn primary" onClick={() => setCreateOpen(true)}><Plus />새 캠페인</button></div>
        </div>

        <div className="kpi-grid">
          <KpiCard label="전체 캠페인" value={campaigns.length} hint="지금까지 만든 캠페인" />
          <KpiCard label="받는 중" value={liveCount} hint="지금 피드백을 받는 캠페인" />
          <KpiCard label="누적 피드백" value={pinCount} hint="모든 캠페인에 모인 피드백" />
          <KpiCard label="마감" value={campaigns.length - liveCount} hint="피드백 수집을 마친 캠페인" />
        </div>

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="캠페인 제목 · 참여 코드 검색" /></div>
          <div className="filter-tabs">{(Object.keys(filterLabel) as Filter[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{filterLabel[key]}</button>)}</div>
        </div>

        {visible.length ? (
          <div className="material-grid">
            {visible.map((campaign) => (
              <article
                className="material-card campaign-card"
                key={campaign.id}
                role="link"
                tabIndex={0}
                onClick={() => openCampaign(campaign)}
                onKeyDown={(event) => openCampaignWithKeyboard(event, campaign)}
                aria-label={`${campaign.title} 캠페인 열기`}
              >
                <span className="material-thumb campaign-thumb">
                  {campaign.imageUrl
                    ? <img src={campaign.imageUrl} alt={`${campaign.title} 기준 이미지`} />
                    : <span className="slide-placeholder">이미지 없음</span>}
                  <em className={`live-badge ${campaign.status}`}><i />{campaign.status === "live" ? "받는 중" : "마감"}</em>
                </span>
                <span className="material-body">
                  <b>{campaign.title}</b>
                  <small><Clock3 />{timeAgo(campaign.createdAt)} 생성</small>
                  <span className="material-stats">
                    <span><b>{campaign.pins.length}</b>피드백</span>
                    <span><b>{campaign.code}</b>참여 코드</span>
                    <button
                      className="icon-btn campaign-share-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCopied(false);
                        setSharedCampaign(campaign);
                      }}
                      aria-label={`${campaign.title} 참여 링크 공유`}
                      title="참여 링크 공유"
                    >
                      <Share2 />
                    </button>
                  </span>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-empty">
              <Grid2X2 />
              <b>{campaigns.length ? "조건에 맞는 캠페인이 없어요" : "아직 만든 캠페인이 없어요"}</b>
              <span>{campaigns.length ? "검색어나 필터를 바꿔보세요." : "행사 포스터, 운영표, 앱 화면 무엇이든 올리고 피드백을 받아보세요."}</span>
              {!campaigns.length && <button className="btn primary" onClick={() => setCreateOpen(true)}><Plus />새 캠페인</button>}
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={closeCreate}>
          <div className="share-modal campaign-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-campaign-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={closeCreate} disabled={submitting} aria-label="닫기"><X /></button>
            <div className="modal-icon"><Plus /></div>
            <h2 id="create-campaign-title">새 캠페인 만들기</h2>
            <p>피드백을 받을 기준 이미지와 안내를 등록하세요.</p>
            <form className="campaign-form" onSubmit={submit}>
              {formError && <div className="upload-error" role="alert">{formError}</div>}
              <label className="campaign-field">
                <span>제목 <small>필수</small></span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="예: 가을 축제 운영 피드백" required autoFocus />
                <small>{title.length}/120</small>
              </label>
              <label className="campaign-field">
                <span>안내문 <small>선택</small></span>
                <div className="textarea-wrap">
                  <textarea value={guideText} onChange={(event) => setGuideText(event.target.value)} maxLength={300} placeholder="예: 부스 배치와 동선에서 좋았던 점과 아쉬웠던 점을 눌러서 남겨주세요." />
                  <span>{guideText.length}/300</span>
                </div>
              </label>
              <div className="campaign-field">
                <span>기준 이미지 <small>필수</small></span>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => pickImage(event.target.files?.[0])} />
                <div className="upload-card campaign-image-picker">
                  {previewUrl
                    ? <img className="campaign-image-preview" src={previewUrl} alt="선택한 기준 이미지 미리보기" />
                    : <div className="upload-icon"><Upload /></div>}
                  <p>{imageFile ? imageFile.name : "JPG, PNG, WEBP · 최대 10MB"}</p>
                  <button className="btn secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={submitting}><Upload />{imageFile ? "다른 이미지 선택" : "이미지 선택"}</button>
                </div>
              </div>
              <div className="campaign-form-actions">
                <button className="btn secondary" type="button" onClick={closeCreate} disabled={submitting}>취소</button>
                <button className="btn primary" type="submit" disabled={submitting}>{submitting ? <><span className="spinner" />생성 중…</> : <><Plus />캠페인 만들기</>}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sharedCampaign && (
        <div className="modal-backdrop" onMouseDown={() => setSharedCampaign(null)}>
          <div className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-campaign-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSharedCampaign(null)} aria-label="닫기"><X /></button>
            <div className="modal-icon"><Users /></div>
            <h2 id="share-campaign-title">참여자를 초대하세요</h2>
            <p>QR 코드를 보여주거나 참여 링크를 공유하세요.<br />로그인 없이 바로 피드백을 남길 수 있어요.</p>
            <div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div>
            <div className="session-code"><span>참여 코드</span><b>{sharedCampaign.code}</b></div>
            <div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={() => void copyJoinUrl()} aria-label="참여 링크 복사">{copied ? <Check /> : <Copy />}</button></div>
            <button className="btn primary large full" onClick={() => void copyJoinUrl()}>{copied ? <><Check />복사했어요</> : <><Copy />참여 링크 복사</>}</button>
          </div>
        </div>
      )}
    </PinAdminShell>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className="kpi-value">{value}</b><small>{hint}</small></div>;
}
