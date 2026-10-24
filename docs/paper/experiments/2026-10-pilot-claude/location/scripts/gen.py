import json, random
from PIL import Image, ImageDraw, ImageFont
random.seed(7)
generic = ["이건 무슨 뜻인가요?", "여기 근거가 있나요?", "이 부분 설명 부탁드려요", "왜 이렇게 되나요?", "이거 맞는 건가요?", "이 부분이 잘 이해가 안 돼요"]
targets = {}
rows = ["폐쇄적이고 선택적인 공유", "사진을 중심으로 한 커뮤니케이션", "대화 축적 구조", "관계 유지 목적의 반복 사용", "소규모 그룹 중심", "사진 속 위치 기반 반응"]
cols = ["SOi", "Locket", "BeReal", "KakaoTalk", "Band"]
sym = ["✓✓✓✓✓", "✓✓✓✗△", "✓△✗△△", "✓✗△✓✗", "✓✗✗△✓", "✓✗✗✗✗"]
name = {"✓": "체크", "✗": "X", "△": "세모"}
t10 = [(x, y, f"비교표 '{r}' 행의 {c} 열 칸({name[sym[i][j]]} 표시)") for i, (r, y) in enumerate(zip(rows, [291, 352, 412, 477, 538, 597])) for j, (c, x) in enumerate(zip(cols, [972, 1082, 1165, 1263, 1360]))]
t10 += [(279, 280, "포지셔닝 맵의 Locket(하트) 로고"), (187, 328, "포지셔닝 맵의 BeReal 로고"), (232, 413, "포지셔닝 맵의 Band 로고"),
        (397, 413, "포지셔닝 맵의 카카오톡(TALK) 로고"), (465, 268, "포지셔닝 맵의 SOi 로고"), (598, 392, "포지셔닝 맵 가로축 오른쪽 라벨 '지속적인 대화 중심'")]
targets[10] = t10
targets[2] = [(305, 395, "파이 차트의 15% 조각"), (355, 322, "'185억 달러 이상 규모' 문구"), (135, 553, "파이 차트 범례 '오픈형 SNS 및 기타'"),
  (695, 383, "성장률 '22.6%' 문구"), (680, 480, "2025년 185억 달러 막대"), (822, 430, "2035년 1416억 달러 막대"), (590, 407, "막대 차트 세로축 '500억' 눈금"),
  (1240, 345, "BeReal 카드 설명 문구('No followers. Just friends')"), (1240, 478, "Locket 카드 설명 문구(친한 친구와의 가벼운 일상 공유)"),
  (680, 595, "가운데 출처 각주(Mordor Intelligence)"), (705, 695, "하단 결론 문장")]
targets[12] = [(180, 252, "부스 참여자 '400+'"), (765, 252, "서비스 가치 공감 '90%'"), (180, 398, "베타 테스트 '5회'"), (765, 398, "사용 의사 표현 '74%'"),
  (180, 542, "파일럿 테스트 '10명'"), (765, 542, "2주간 리텐션 유지 '80%'"), (1121, 247, "해외 진출 수요 '5개국'"), (1324, 247, "해외 사용자 검증 '+60명'"),
  (1223, 392, "다국어 버전 지원 '영어, 스페인어'"), (300, 712, "왼쪽 사용자 인용 말풍선"), (720, 690, "오른쪽 사용자 인용 말풍선"), (1223, 640, "해외 검증 사진 묶음")]
font = ImageFont.load_default(size=13)
out = {}
for page, ts in targets.items():
    pins = []
    for (x, y, label) in ts:
        for _ in range(1 if page == 10 else 2):
            pins.append({"x": x + random.randint(-8, 8), "y": y + random.randint(-6, 6), "label": label, "text": random.choice(generic)})
    random.shuffle(pins)
    for n, p in enumerate(pins, 1): p["n"] = n
    out[page] = pins
    base = Image.open(f"s{page}-{page:02d}.png").convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for p in pins:
        d.ellipse([p["x"] - 4, p["y"] - 4, p["x"] + 4, p["y"] + 4], fill=(230, 0, 0, 230))
        d.text((p["x"] + 6, p["y"] - 15), str(p["n"]), fill=(230, 0, 0, 255), font=font, stroke_width=2, stroke_fill=(255, 255, 255, 255))
    Image.alpha_composite(base, layer).convert("RGB").save(f"mark{page}.png")
json.dump(out, open("pins.json", "w"), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in out.items()})
