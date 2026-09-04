"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { submitLectureExperienceResponse } from "@/app/_service/platform-experience-service";

export function usePlatformExperienceController(code: string) {
  const { t } = useLanguage();
  const [experience, setExperience] = useState("");
  const [improvement, setImprovement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const normalizedExperience = experience.trim();
    const normalizedImprovement = improvement.trim();
    if (!normalizedExperience || !normalizedImprovement) return setError(t("experience.required"));
    setSubmitting(true);
    setError(null);
    try {
      await submitLectureExperienceResponse(code, normalizedExperience, normalizedImprovement);
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

  return { experience, setExperience, improvement, setImprovement, submitting, submitted, error, submit };
}
