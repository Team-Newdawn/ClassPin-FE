"use client";

import { useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import {
  configuredQuestionCategories,
  enabledQuestionCategories,
  isValidQuestionCategorySettings,
  QUESTION_CATEGORY_LABEL_MAX,
  QUESTION_CATEGORY_MAX,
  questionCategoryClass,
  questionCategoryLabel,
  type QuestionCategory,
  type QuestionCategorySettings
} from "@/app/_model/types";
import { Check, Plus, Trash2 } from "@/app/component/icons";

export function QuestionCategoryManager({ initialSettings, usedCategories, onSave, onError }: {
  initialSettings: QuestionCategorySettings;
  usedCategories: QuestionCategory[];
  onSave: (settings: QuestionCategorySettings) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { categoryLabel: defaultCategoryLabel, t } = useLanguage();
  const [settings, setSettings] = useState(initialSettings);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const categories = configuredQuestionCategories(settings);
  const activeCategories = enabledQuestionCategories(settings);
  const label = (category: string) => questionCategoryLabel(settings, category, defaultCategoryLabel);

  const addCategory = () => {
    const categoryLabel = newCategory.trim();
    if (!categoryLabel) return;
    if (categories.length >= QUESTION_CATEGORY_MAX) return onError(t("session.questionCategoryLimit", { count: QUESTION_CATEGORY_MAX }));
    if (categories.some((key) => label(key).toLocaleLowerCase() === categoryLabel.toLocaleLowerCase())) return onError(t("session.questionCategoryDuplicate"));
    setSettings((current) => ({ ...current, [`custom-${crypto.randomUUID()}`]: { label: categoryLabel, enabled: true, archived: false } }));
    setNewCategory("");
    onError(null);
  };

  const deleteCategory = (key: string) => {
    setSettings((current) => {
      if (usedCategories.includes(key)) return { ...current, [key]: { ...current[key], enabled: false, archived: true } };
      const next = { ...current };
      delete next[key];
      return next;
    });
    onError(null);
  };

  const save = async () => {
    if (saving) return;
    const next = Object.fromEntries(Object.entries(settings).map(([key, setting]) => [key, { ...setting, label: setting.label.trim() }]));
    if (!isValidQuestionCategorySettings(next)) return onError(t("session.questionCategoryInvalid"));
    onError(null);
    setSaving(true);
    try {
      await onSave(next);
      setSettings(next);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${t("session.questionCategorySaveError")}: ${detail}`, error);
      onError(t("session.questionCategorySaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="question-category-manager" aria-labelledby="question-category-manager-title">
      <div className="question-category-manager-head">
        <div><b id="question-category-manager-title">{t("session.questionCategoryTitle")}</b><small>{t("session.questionCategoryDescription")}</small></div>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>{saving ? <span className="spinner" /> : <Check />}{t(saving ? "session.questionCategorySaving" : "session.questionCategorySave")}</button>
      </div>
      <form className="question-category-add" onSubmit={(event) => { event.preventDefault(); addCategory(); }}>
        <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={QUESTION_CATEGORY_LABEL_MAX} placeholder={t("session.questionCategoryPlaceholder")} aria-label={t("session.questionCategoryPlaceholder")} disabled={saving || categories.length >= QUESTION_CATEGORY_MAX} />
        <button className="btn secondary" disabled={saving || !newCategory.trim() || categories.length >= QUESTION_CATEGORY_MAX}><Plus />{t("session.questionCategoryAdd")}</button>
      </form>
      <div className="question-category-manager-list">
        {categories.map((key) => <div className={`question-category-manager-row ${settings[key].enabled ? "" : "disabled"}`} key={key}>
          <div className="question-category-manager-row-head">
            <span className={`category ${questionCategoryClass(settings, key)}`}>{label(key)}</span>
            <label><input type="checkbox" checked={settings[key].enabled} onChange={(event) => setSettings((current) => ({ ...current, [key]: { ...current[key], enabled: event.target.checked } }))} aria-label={t("session.questionCategoryUseAria", { category: label(key) })} disabled={saving} />{t("session.questionCategoryUse")}</label>
          </div>
          <label><span>{t("session.questionCategoryDisplayName")}</span><input value={settings[key].label} onChange={(event) => setSettings((current) => ({ ...current, [key]: { ...current[key], label: event.target.value } }))} maxLength={QUESTION_CATEGORY_LABEL_MAX} placeholder={label(key)} aria-label={t("session.questionCategoryDisplayNameAria", { category: label(key) })} disabled={saving} /></label>
          <button type="button" className="icon-btn category-delete" onClick={() => deleteCategory(key)} aria-label={t("session.questionCategoryDelete", { category: label(key) })} disabled={saving}><Trash2 /></button>
        </div>)}
      </div>
      <p>{t(activeCategories.length ? "session.questionCategoryEnabledHint" : "session.questionCategoryInvalid")}</p>
    </section>
  );
}
