import json, random
from PIL import Image, ImageDraw, ImageFont
random.seed(11)
generic = ["이건 무슨 뜻인가요?", "여기 근거가 있나요?", "이 부분 설명 부탁드려요", "왜 이렇게 되나요?", "이거 맞는 건가요?", "이 부분이 잘 이해가 안 돼요", "자세히 알려주세요", "출처가 궁금해요"]
rows = ["폐쇄적이고 선택적인 공유", "사진을 중심으로 한 커뮤니케이션", "대화 축적 구조", "관계 유지 목적의 반복 사용", "소규모 그룹 중심", "사진 속 위치 기반 반응"]
rowy = [(262, 322), (322, 382), (382, 445), (445, 508), (508, 568), (568, 626)]
cols = ["SOi", "Locket", "BeReal", "KakaoTalk", "Band"]; colx = [(925, 1020), (1035, 1125), (1125, 1212), (1215, 1310), (1312, 1410)]
sym = ["✓✓✓✓✓", "✓✓✓✗△", "✓△✗△△", "✓✗△✓✗", "✓✗✗△✓", "✓✗✗✗✗"]; name = {"✓": "체크", "✗": "X", "△": "세모"}
boxes = {10: [], 2: []}
for i, r in enumerate(rows):
    for j, c in enumerate(cols):
        w = 6 if (c in ("KakaoTalk", "Band") and i in (2, 3)) else 1   # hotspot 2x2 block
        boxes[10].append(((colx[j][0] + 6, rowy[i][0] + 6, colx[j][1] - 6, rowy[i][1] - 6), f"비교표 '{r}' 행의 {c} 열 칸({name[sym[i][j]]})", w))
boxes[10] += [((250, 250, 310, 310), "포지셔닝 맵의 Locket(하트) 로고", 2), ((157, 298, 217, 358), "포지셔닝 맵의 BeReal 로고", 2), ((203, 383, 263, 443), "포지셔닝 맵의 Band 로고", 2),
  ((367, 383, 427, 443), "포지셔닝 맵의 카카오톡(TALK) 로고", 2), ((435, 238, 495, 298), "포지셔닝 맵의 SOi 로고", 2), ((560, 370, 640, 418), "포지셔닝 맵 라벨 '지속적인 대화 중심'", 1), ((280, 165, 370, 210), "포지셔닝 맵 라벨 '친밀한 관계 중심'", 1)]
boxes[2] = [((262, 345, 360, 440), "파이 차트의 15%(파란) 조각", 2), ((170, 390, 250, 525), "파이 차트의 회색 부분(오픈형 SNS 및 기타)", 2), ((265, 310, 445, 334), "'185억 달러 이상 규모' 문구", 2), ((265, 287, 375, 306), "'프라이빗 SNS' 라벨", 1),
  ((650, 368, 740, 398), "성장률 '22.6%' 문구", 4), ((636, 426, 724, 447), "막대 위 '185억 달러' 라벨", 4), ((652, 452, 710, 520), "2025년 막대", 4), ((792, 335, 850, 520), "2035년 막대", 4),
  ((775, 306, 872, 328), "'1416억 달러' 라벨", 4), ((560, 398, 610, 416), "세로축 '500억' 눈금", 4), ((560, 455, 610, 473), "세로축 '100억' 눈금", 4), ((552, 342, 612, 360), "세로축 '1000억' 눈금", 4),
  ((650, 535, 705, 555), "가로축 '2025' 라벨", 3), ((795, 535, 850, 555), "가로축 '2035' 라벨", 3),
  ((1000, 300, 1088, 388), "BeReal 로고", 1), ((1100, 322, 1380, 370), "BeReal 카드 설명 문구", 1), ((1000, 433, 1088, 522), "Locket 로고", 1), ((1100, 455, 1380, 500), "Locket 카드 설명 문구", 1)]
count = {10: 100, 2: 70}
font = ImageFont.load_default(size=12)
out = {}
for page, bs in boxes.items():
    pins = []
    for _ in range(count[page]):
        (x1, y1, x2, y2), label, _w = random.choices(bs, weights=[b[2] for b in bs])[0]
        pins.append({"x": random.randint(x1, x2), "y": random.randint(y1, y2), "label": label, "text": random.choice(generic)})
    random.shuffle(pins)
    for n, p in enumerate(pins, 1): p["n"] = n
    out[page] = pins
    base = Image.open(f"s{page}-{page:02d}.png").convert("RGBA")
    for kind in ("num", "dot"):
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
        for p in pins:
            d.ellipse([p["x"] - 4, p["y"] - 4, p["x"] + 4, p["y"] + 4], fill=(230, 0, 0, 200))
            if kind == "num": d.text((p["x"] + 5, p["y"] - 13), str(p["n"]), fill=(230, 0, 0, 255), font=font, stroke_width=2, stroke_fill=(255, 255, 255, 255))
        Image.alpha_composite(base, layer).convert("RGB").save(f"hard-{kind}{page}.png")
json.dump(out, open("pins-hard.json", "w"), ensure_ascii=False, indent=1)
from collections import Counter
print({k: len(v) for k, v in out.items()}, Counter(p["label"] for p in out[10]).most_common(4))
