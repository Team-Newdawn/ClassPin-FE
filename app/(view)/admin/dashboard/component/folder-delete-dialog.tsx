"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/app/component/dialog/confirm-dialog";
import { useLanguage } from "@/app/_controller/provider/language-context";
import type { FolderSummary } from "@/app/_model/material/stats";
import styles from "./folder-delete-dialog.module.css";

export function FolderDeleteDialog({ folder, saving, error, onClose, onDelete }: {
  folder: FolderSummary;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: (contents: boolean) => void;
}) {
  const { t, locale } = useLanguage();
  const [contents, setContents] = useState(false);

  return <ConfirmDialog title={`‘${folder.name}’ ${t("folders.deleteTitle")}`} saving={saving} error={error} onClose={onClose} onConfirm={() => onDelete(contents)}
    description={locale === "ko" ? `폴더 안에 자료 ${folder.materialCount}개와 지난 강의의 질문 ${folder.questionCount}개가 있어요.` : `${folder.materialCount} materials and ${folder.questionCount} questions are in this folder.`}
    confirm={{ label: t("folders.delete"), saving: t("folders.deleting") }}>
    <fieldset disabled={saving} className={styles.options}><legend className="sr-only">{t("folders.delete")}</legend>
      {[false, true].map((all) => <label key={String(all)} className={`${styles.option} ${all ? styles.danger : ""}`}>
        <input type="radio" name="delete-folder-contents" checked={contents === all} onChange={() => setContents(all)} />
        <span><b>{t(all ? "folders.deleteAll" : "folders.deleteOnly")}</b><small>{t(all ? "folders.deleteAllHint" : "folders.deleteOnlyHint")}</small></span>
      </label>)}
    </fieldset>
  </ConfirmDialog>;
}
