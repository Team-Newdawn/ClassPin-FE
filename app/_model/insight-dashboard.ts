export type DashboardQuestion = { id: string; slideIndex: number; x: number | null; y: number | null; text: string; reactionCount: number; createdAt: string };
type LectureSpan = { start: number; end: number };
type TimelineSample = { at: string; audience: number; slide: number };
type SlideChange = { at: string; slide: number };
type Interval = { slide: number; start: number; end: number };

const MINUTE = 60_000;
const isPin = (question: DashboardQuestion) => question.x !== null && question.y !== null;
const minuteCount = (span: LectureSpan) => Math.max(1, Math.ceil((span.end - span.start) / MINUTE));
const inSpan = (time: number, span: LectureSpan) => time >= span.start && time <= span.end;
// A time exactly at span.end belongs to the last minute.
const minuteOf = (time: number, span: LectureSpan) => Math.min(Math.floor((time - span.start) / MINUTE), minuteCount(span) - 1);

export function lectureSpan(startedAt: string | null, endedAt: string | null, questions: DashboardQuestion[]): LectureSpan | null {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start)) return null;
  const ended = endedAt ? Date.parse(endedAt) : NaN;
  const end = Number.isFinite(ended) ? ended : Math.max(start, ...questions.map((question) => Date.parse(question.createdAt)).filter(Number.isFinite));
  return { start, end: Math.max(start, end) };
}

export function pinsPerMinute(questions: DashboardQuestion[], span: LectureSpan): { minute: number; pins: number }[] {
  const minutes = Array.from({ length: minuteCount(span) }, (_, minute) => ({ minute, pins: 0 }));
  for (const question of questions) {
    const time = Date.parse(question.createdAt);
    if (isPin(question) && inSpan(time, span)) minutes[minuteOf(time, span)].pins += 1;
  }
  return minutes;
}

export function audienceSeries(samples: TimelineSample[], span: LectureSpan): { minute: number; audience: number; slide: number }[] {
  return samples
    .map((sample) => ({ ...sample, time: Date.parse(sample.at) }))
    .filter((sample) => inSpan(sample.time, span))
    .sort((a, b) => a.time - b.time)
    .map((sample) => ({ minute: minuteOf(sample.time, span), audience: sample.audience, slide: sample.slide }));
}

export function slideIntervals(slideChanges: SlideChange[], samples: TimelineSample[], span: LectureSpan): Interval[] {
  const marks = (slideChanges.length ? slideChanges : samples)
    .map((mark) => ({ slide: mark.slide, time: Date.parse(mark.at) }))
    .filter((mark) => Number.isFinite(mark.time))
    .sort((a, b) => a.time - b.time);
  return marks
    .map((mark, index) => ({
      slide: mark.slide,
      start: Math.max(mark.time, span.start),
      end: Math.min(marks[index + 1]?.time ?? span.end, span.end)
    }))
    .filter((interval) => interval.end > interval.start);
}

/** `span` limits the per-minute rate to PINs of that LIVE run; without it every PIN counts (older runs would inflate the rate). */
export function slideStats(slideCount: number, questions: DashboardQuestion[], intervals: Interval[], span?: LectureSpan): { slide: number; seconds: number; pins: number; reactions: number; pinsPerMinute: number | null }[] {
  return Array.from({ length: slideCount }, (_, index) => {
    const slide = index + 1;
    const seconds = Math.round(intervals.filter((interval) => interval.slide === slide).reduce((sum, interval) => sum + interval.end - interval.start, 0) / 1000);
    const onSlide = questions.filter((question) => question.slideIndex === index);
    const pins = onSlide.filter(isPin).length;
    return {
      slide,
      seconds,
      pins,
      reactions: onSlide.reduce((sum, question) => sum + question.reactionCount, 0),
      pinsPerMinute: seconds ? Math.round(((span ? onSlide.filter((q) => isPin(q) && inSpan(Date.parse(q.createdAt), span)).length : pins) / (seconds / 60)) * 100) / 100 : null
    };
  });
}

export function slideTimeline(slide: number, intervals: Interval[], samples: TimelineSample[], questions: DashboardQuestion[], span: LectureSpan): { minute: number; audience: number | null; pins: number }[] {
  const minutes = new Set<number>();
  for (const interval of intervals) {
    if (interval.slide !== slide) continue;
    const last = Math.min(Math.ceil((interval.end - span.start) / MINUTE), minuteCount(span)) - 1;
    for (let minute = Math.floor((interval.start - span.start) / MINUTE); minute <= last; minute += 1) minutes.add(minute);
  }
  const audience = new Map(audienceSeries(samples, span).map((sample) => [sample.minute, sample.audience]));
  const pins = new Map<number, number>();
  for (const question of questions) {
    const time = Date.parse(question.createdAt);
    if (question.slideIndex + 1 !== slide || !isPin(question) || !inSpan(time, span)) continue;
    const minute = minuteOf(time, span);
    pins.set(minute, (pins.get(minute) ?? 0) + 1);
  }
  return [...minutes].sort((a, b) => a - b).map((minute) => ({ minute, audience: audience.get(minute) ?? null, pins: pins.get(minute) ?? 0 }));
}

// Longest first so "으로" is stripped whole, not just "로".
const PARTICLES = ["해주세요", "해주세", "이라고", "인가요", "인지", "는지", "한가요", "할까요", "해요", "건가요", "들은", "들이", "들을", "을까", "하는", "라는", "들", "한", "된", "에서", "으로", "에게", "까지", "부터", "나요", "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "요"];
const STOPWORDS = new Set(["그리고", "그런데", "이거", "저거", "그거", "어떻게", "무엇", "뭐", "왜", "이것", "저것", "수", "것", "거", "좀", "더", "왜요", "있나요", "하나요", "무엇인", "궁금", "궁금해", "궁금합니다", "뭔가", "건가", "건지", "어떤", "이런", "그런", "나요", "인가", "있을까", "않을까", "있나", "없나", "라는", "대한", "나온", "것을", "같은", "있는", "없는", "하나", "될까", "할까", "했나요", "있어", "없어", "the", "a", "an", "is", "are", "to", "of", "and", "what", "how", "why"]);

export function keywords(texts: string[], limit = 20): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const raw of text.toLowerCase().split(/[^\p{Script=Hangul}a-z0-9]+/u)) {
      const particle = PARTICLES.find((suffix) => raw.endsWith(suffix) && raw.length - suffix.length >= 2);
      const word = particle ? raw.slice(0, -particle.length) : raw;
      if (word.length < 2 || /^\d+$/.test(word) || STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  // Stable sort keeps first appearance order for ties.
  return [...counts].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
