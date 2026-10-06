# climbdex

클라이밍 도감 앱. 영상 자동 컷으로 시작해 암장 도감·띠레벨 표로 확장한다. 기능을 한 번에 하나씩 붙인다. 현재 단계는 `docs/STATUS.md`를 먼저 읽는다.

## 로드맵 (순서 고정)
1. 영상 자동 컷 — 혼자 써도 완성, 서버 없음, 첫 출시 목표
2. 암장 도감 — 진행 중. 카카오로 시딩 끝(`data/gyms.json` 511곳, API 재호출 안 함), 위치 체크인, 사진은 사용자가 찍음. 서버 없음
3. 띠레벨 표 — 도감 인증(체크인)된 사람만 투표, 둘 비교 방식, 내부 저장은 V등급 범위. 서버는 여기서 도입

상세는 `docs/roadmap.md`. 다음 단계 기능을 미리 만들지 않는다.

## 원칙
- 영상은 폰 밖으로 내보내지 않는다. 처리는 전부 온디바이스
- 자동 검출은 초안, 확정은 사용자가 조절 바로 한다
- 암장 데이터에는 종류 칸(실내·자연암벽·리드·해외)만 두고 기능은 만들지 않는다

## 세션 규칙
- 이 레포는 두 기기(회사 맥·개인 노트북)에서 번갈아 작업한다. 세션 컨텍스트가 공유되지 않으므로 결정 사항은 대화가 아니라 `docs/`에 남긴다
- 작업을 끝낼 때마다 `docs/STATUS.md`를 갱신한다. 마지막에 한 일, 다음에 할 일, 막힌 것 세 항목
- 코드에 설명용 주석을 넣지 않는다
- 커밋·푸시는 사용자가 지시할 때만

## 환경
- Expo SDK 54 고정. 올리려면 Xcode 26 필요
- Metro: `npx expo start --dev-client` (Swift 모듈이 있어 Expo Go 불가, 직접 빌드한 앱만 붙음)
- 빌드: `npx expo run:ios --device <UDID>`. 실기기는 클래식 UDID(`00008110-…`), 시뮬레이터는 simctl UUID. pod는 homebrew `pod` 사용
- 검출 로직을 바꾼 뒤엔 앱에서 "전체 비우기" 후 다시 골라야 함. 검출 결과가 영상 목록과 함께 저장돼 옛 결과가 남음
- 시뮬레이터 테스트 영상 넣기: ASCII 경로로 복사 후 `xcrun simctl addmedia <UDID> <file>`
- 안드로이드: `npx expo run:android` (에뮬레이터 Pixel_7 먼저 띄움). 에뮬레이터에 영상 넣기: `adb push <file> /sdcard/Movies/` 후 `MEDIA_SCANNER_SCAN_FILE` 브로드캐스트. Metro는 `adb reverse tcp:8081 tcp:8081`
- `gyms.json`을 `collect-gyms.mjs --offline`으로 다시 만들면 `types` 칸이 비므로 바로 `python3 scripts/spiri7-grades.py`를 이어서 돌린다
- 네이티브 로직은 `scripts/detect.swift`가 원본. iOS 모듈은 그 본문을 복사해 만들고, Android는 `Segmenter.kt`에 같은 규칙을 손으로 옮김. 규칙을 바꾸면 세 군데 같이
