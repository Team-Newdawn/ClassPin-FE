import { feedbackCategoryLabel, type Campaign, type FeedbackPin } from "./types";

const HEADERS = ["순번", "x", "y", "유형", "내용", "표시여부", "남긴시각"];

/** 의견 본문에 섞인 쉼표·따옴표·줄바꿈이 열을 밀어내지 않도록 RFC 4180 방식으로 감싼다. */
const escapeCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const pad = (value: number) => String(value).padStart(2, "0");

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// 정규화 좌표는 소수 4자리면 4000px 이미지에서도 1px 안쪽이라 원래 지점을 되짚기에 충분하다.
const coord = (value: number) => value.toFixed(4);

/** 좌표와 내용이 반드시 같은 행에 있어야 분석 도구에서 "어디의 무슨 피드백"으로 읽힌다. */
export const buildPinsCsv = (pins: FeedbackPin[]) =>
  [
    HEADERS.map(escapeCell).join(","),
    ...pins.map((pin, index) => [
      String(index + 1),
      coord(pin.x),
      coord(pin.y),
      feedbackCategoryLabel[pin.category],
      pin.body,
      pin.hidden ? "제외" : "표시",
      formatTime(pin.createdAt)
    ].map(escapeCell).join(","))
  ].join("\r\n");

const fileName = (campaign: Campaign) => {
  const now = new Date();
  const title = campaign.title.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_");
  return `${title || campaign.code}_피드백_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
};

// 엑셀은 BOM 이 없으면 UTF-8 한글을 깨서 연다.
const BOM = "﻿";

export function downloadPinsCsv(campaign: Campaign, pins: FeedbackPin[]) {
  const blob = new Blob([BOM + buildPinsCsv(pins)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName(campaign);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 클릭 직후 해제하면 저장이 시작되기 전에 URL 이 사라지는 브라우저가 있다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
