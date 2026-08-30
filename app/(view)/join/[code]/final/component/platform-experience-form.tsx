"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Send } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { PinLogo } from "@/app/component/pin-logo";
import { submitPlatformExperienceResponse } from "@/app/_service/platform-experience-service";
import styles from "./platform-experience-form.module.css";

const RESPONSE_MAX = 1000;

export function PlatformExperienceForm({ code }: {
  source: "lecture";
  code: string;
}) {
  const { t } = useLanguage();
  const [experience, setExperience] = useState("");
  const [improvement, setImprovement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const homeHref = "/";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const normalizedExperience = experience.trim();
    const normalizedImprovement = improvement.trim();
    if (!normalizedExperience || !normalizedImprovement) {
      setError(t("experience.required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitPlatformExperienceResponse(code, normalizedExperience, normalizedImprovement);
      setSubmitted(true);
    } catch (submitError) {
      const detail = submitError && typeof submitError === "object" && "message" in submitError
        ? String(submitError.message)
        : String(submitError);
      console.error(`Platform experience save failed: ${detail}`, submitError);
      setError(t("experience.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  return <main className={`${styles.root} experience-final-shell`}>
    <header className="student-header">
      <PinLogo href={homeHref} product="Class" />
      <LanguageSwitcher />
    </header>
    <section className="experience-final-content">
      <div className="experience-final-card">
        {submitted ? <div className="experience-success" role="status">
          <span><Check /></span>
          <h1>{t("experience.successTitle")}</h1>
          <p>{t("experience.successDescription")}</p>
          <Link className="btn primary large full" href={homeHref}>{t("experience.finish")}</Link>
        </div> : <>
          <span className="eyebrow">{t("experience.eyebrow")}</span>
          <h1>{t("experience.title")}</h1>
          <p>{t("experience.description")}</p>
          <form onSubmit={submit}>
            <label className="experience-field">
              <span>{t("experience.experienceLabel")}</span>
              <span className="textarea-wrap">
                <textarea
                  value={experience}
                  onChange={(event) => setExperience(event.target.value)}
                  maxLength={RESPONSE_MAX}
                  placeholder={t("experience.experiencePlaceholder")}
                  required
                />
                <span>{experience.length}/{RESPONSE_MAX}</span>
              </span>
            </label>
            <label className="experience-field">
              <span>{t("experience.improvementLabel")}</span>
              <span className="textarea-wrap">
                <textarea
                  value={improvement}
                  onChange={(event) => setImprovement(event.target.value)}
                  maxLength={RESPONSE_MAX}
                  placeholder={t("experience.improvementPlaceholder")}
                  required
                />
                <span>{improvement.length}/{RESPONSE_MAX}</span>
              </span>
            </label>
            {error && <p className="experience-error" role="alert">{error}</p>}
            <button className="btn primary large full" type="submit" disabled={submitting}>
              {submitting ? <span className="spinner" /> : <Send />}
              {t("experience.submit")}
            </button>
          </form>
        </>}
      </div>
    </section>
  </main>;
}
