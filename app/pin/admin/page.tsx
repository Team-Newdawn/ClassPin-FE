"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { PinAdminShell } from "@/components/pin/admin-shell";
import { useCampaigns } from "@/components/pin/campaign-store";
import { Check, Clock3, Copy, Grid2X2, Link2, Plus, Search, Share2, Upload, Users, X } from "@/components/icons";
import { useLanguage } from "@/components/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { isPdfFile } from "@/lib/pin/pdf-reference";
import type { Campaign } from "@/lib/pin/types";

type Filter = "all" | Campaign["status"];

const filterTranslationKey: Record<Filter, TranslationKey> = {
  all: "common.all",
  live: "pin.status.live",
  ended: "pin.status.ended"
};
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 10 * 1024 * 1024;

function imageValidationError(file: File, t: (key: TranslationKey) => string) {
  if (!acceptedImageTypes.has(file.type) && !isPdfFile(file)) return t("pin.admin.validationImageType");
  if (file.size > maxImageBytes) return t("pin.admin.validationImageSize");
  return null;
}

export default function PinAdminPage() {
  const { t, timeAgo } = useLanguage();
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
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [pdfSelected, setPdfSelected] = useState(false);
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

  const replaceImage = (file: File | null, sourceName = file?.name ?? "", fromPdf = false) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = file && !fromPdf ? URL.createObjectURL(file) : "";
    previewUrlRef.current = nextPreviewUrl;
    setReferenceFile(file);
    setSourceFileName(sourceName);
    setPdfSelected(fromPdf);
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
    const error = imageValidationError(file, t);
    if (error) {
      replaceImage(null);
      setFormError(error);
      return;
    }
    replaceImage(file, file.name, isPdfFile(file));
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanGuideText = guideText.trim();
    if (!cleanTitle) {
      setFormError(t("pin.admin.validationTitleRequired"));
      return;
    }
    if (cleanTitle.length > 120) {
      setFormError(t("pin.admin.validationTitleLength"));
      return;
    }
    if (cleanGuideText.length > 300) {
      setFormError(t("pin.admin.validationGuideLength"));
      return;
    }
    if (!referenceFile) {
      setFormError(t("pin.admin.validationImageRequired"));
      return;
    }
    const imageError = imageValidationError(referenceFile, t);
    if (imageError) {
      setFormError(imageError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const campaign = await createCampaign({ title: cleanTitle, guideText: cleanGuideText, referenceFile });
      router.push(`/pin/admin/${campaign.id}`);
    } catch (error) {
      console.error("Campaign creation failed", error);
      setFormError(error instanceof Error && error.message ? error.message : t("pin.admin.createError"));
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
          <div><h1>{t("pin.admin.title")}</h1><p>{t("pin.admin.description")}</p></div>
          <div className="page-actions"><button className="btn primary" onClick={() => setCreateOpen(true)}><Plus />{t("pin.admin.newCampaign")}</button></div>
        </div>

        <div className="kpi-grid">
          <KpiCard label={t("pin.admin.totalCampaigns")} value={campaigns.length} hint={t("pin.admin.totalCampaignsHint")} />
          <KpiCard label={t("pin.admin.liveCampaigns")} value={liveCount} hint={t("pin.admin.liveCampaignsHint")} />
          <KpiCard label={t("pin.admin.totalFeedback")} value={pinCount} hint={t("pin.admin.totalFeedbackHint")} />
          <KpiCard label={t("pin.admin.endedCampaigns")} value={campaigns.length - liveCount} hint={t("pin.admin.endedCampaignsHint")} />
        </div>

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("pin.admin.searchCampaigns")} /></div>
          <div className="filter-tabs">{(Object.keys(filterTranslationKey) as Filter[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{t(filterTranslationKey[key])}</button>)}</div>
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
                aria-label={t("pin.admin.openCampaign", { title: campaign.title })}
              >
                <span className="material-thumb campaign-thumb">
                  {campaign.pages[0]?.imageUrl
                    ? <img src={campaign.pages[0].imageUrl} alt={t("pin.image.alt", { title: campaign.title })} />
                    : <span className="slide-placeholder">{t("pin.image.unavailable")}</span>}
                  <em className={`live-badge ${campaign.status}`}><i />{t(campaign.status === "live" ? "pin.status.live" : "pin.status.ended")}</em>
                </span>
                <span className="material-body">
                  <b>{campaign.title}</b>
                  <small><Clock3 />{t("pin.admin.created", { time: timeAgo(campaign.createdAt) })}</small>
                  <span className="material-stats">
                    <span><b>{campaign.pins.length}</b>{t("pin.admin.feedback")}</span>
                    <span><b>{campaign.code}</b>{t("pin.admin.joinCode")}</span>
                    <button
                      className="icon-btn campaign-share-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCopied(false);
                        setSharedCampaign(campaign);
                      }}
                      aria-label={t("pin.admin.shareCampaign", { title: campaign.title })}
                      title={t("pin.admin.shareJoinLink")}
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
              <b>{t(campaigns.length ? "pin.admin.noMatch" : "pin.admin.none")}</b>
              <span>{t(campaigns.length ? "pin.admin.changeSearch" : "pin.admin.emptyHint")}</span>
              {!campaigns.length && <button className="btn primary" onClick={() => setCreateOpen(true)}><Plus />{t("pin.admin.newCampaign")}</button>}
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={closeCreate}>
          <div className="share-modal campaign-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-campaign-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={closeCreate} disabled={submitting} aria-label={t("pin.admin.close")}><X /></button>
            <div className="modal-icon"><Plus /></div>
            <h2 id="create-campaign-title">{t("pin.admin.createTitle")}</h2>
            <p>{t("pin.admin.createDescription")}</p>
            <form className="campaign-form" onSubmit={submit}>
              {formError && <div className="upload-error" role="alert">{formError}</div>}
              <label className="campaign-field">
                <span>{t("pin.admin.fieldTitle")} <small>{t("pin.admin.required")}</small></span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={t("pin.admin.titlePlaceholder")} required autoFocus />
                <small>{title.length}/120</small>
              </label>
              <label className="campaign-field">
                <span>{t("pin.admin.fieldGuide")} <small>{t("pin.admin.optional")}</small></span>
                <div className="textarea-wrap">
                  <textarea value={guideText} onChange={(event) => setGuideText(event.target.value)} maxLength={300} placeholder={t("pin.admin.guidePlaceholder")} />
                  <span>{guideText.length}/300</span>
                </div>
              </label>
              <div className="campaign-field">
                <span>{t("pin.admin.fieldImage")} <small>{t("pin.admin.required")}</small></span>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(event) => void pickImage(event.target.files?.[0])} />
                <div className="upload-card campaign-image-picker">
                  {previewUrl
                    ? <img className="campaign-image-preview" src={previewUrl} alt={t("pin.admin.selectedImageAlt")} />
                    : <div className="upload-icon"><Upload /></div>}
                  <p>{sourceFileName
                      ? `${sourceFileName}${pdfSelected ? ` · ${t("pin.admin.pdfAllPages")}` : ""}`
                      : t("pin.admin.imageRequirement")}</p>
                  <button className="btn secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={submitting}><Upload />{t(referenceFile ? "pin.admin.chooseDifferentImage" : "pin.admin.chooseImage")}</button>
                </div>
              </div>
              <div className="campaign-form-actions">
                <button className="btn secondary" type="button" onClick={closeCreate} disabled={submitting}>{t("pin.admin.cancel")}</button>
                <button className="btn primary" type="submit" disabled={submitting}>{submitting ? <><span className="spinner" />{t(pdfSelected ? "pin.admin.convertingAndCreating" : "pin.admin.creating")}</> : <><Plus />{t("pin.home.createCampaign")}</>}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sharedCampaign && (
        <div className="modal-backdrop" onMouseDown={() => setSharedCampaign(null)}>
          <div className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-campaign-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSharedCampaign(null)} aria-label={t("pin.admin.close")}><X /></button>
            <div className="modal-icon"><Users /></div>
            <h2 id="share-campaign-title">{t("pin.admin.shareTitle")}</h2>
            <p>{t("pin.admin.shareDescription1")}<br />{t("pin.admin.shareDescription2")}</p>
            <div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div>
            <div className="session-code"><span>{t("pin.admin.joinCode")}</span><b>{sharedCampaign.code}</b></div>
            <div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={() => void copyJoinUrl()} aria-label={t("pin.admin.copyJoinLink")}>{copied ? <Check /> : <Copy />}</button></div>
            <button className="btn primary large full" onClick={() => void copyJoinUrl()}>{copied ? <><Check />{t("pin.admin.copied")}</> : <><Copy />{t("pin.admin.copyJoinLink")}</>}</button>
          </div>
        </div>
      )}
    </PinAdminShell>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className="kpi-value">{value}</b><small>{hint}</small></div>;
}
