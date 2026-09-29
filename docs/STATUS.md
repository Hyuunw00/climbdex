# STATUS

## 마지막에 한 일 (2026-09-29, 회사 맥)
- 실기기(iPhone 13 Pro) 빌드 성공. 개인 Apple ID 팀(UZTXXV5UD5)으로 서명. `npm run ios:device`
- 검출 규칙을 여섯 번 고친 끝에 **고정**(exp-01 '방법' 참고). 손·서 있음 규칙은 영상마다 예외가 나와 버리고, 바닥 대비 0.12 이상 뜬 덩어리 + 앞 3초/뒤 2초 여유로 정함. 검출 보강 세 가지는 추가: 전체 화면에서 못 찾으면 4조각 확대 검출, 사람 여러 명 동시 추적(추적마다 시도 구간, 겹치면 합침), 프레임 8장 동시 처리. 들고 찍은 영상은 카메라 이동량으로 판별해 '사람 보이는 구간'을 초안으로(기준값 미확정, 샘플 필요). 폰에서 긴 영상(여러 명·여러 시도)과 단일 영상 모두 사용자 확인으로 '어느 정도 잘 잘림'. 새 영상에서 틀리는 게 나와도 규칙을 더 붙이지 않는다
- 앱 UI: 트림 화면에 썸네일 타임라인(핸들 드래그로 시작·끝), 구간 여러 개 편집·삭제·"모든 구간 저장", 편집한 구간 저장, 목록에 썸네일·검출 중 스피너·구간 수·저장 수. 네이티브 `thumbnails(uri, times, width)` 추가
- 자체 갤러리("추가됨" 표시)는 만들었다가 뺌. iOS 사진 앱의 앨범·즐겨찾기·검색을 못 쓰는 손해가 더 큼. 시스템 선택 화면 유지 + 중복 고르면 "건너뛰었어요" 알림
- 목록·검출 결과·편집 구간을 문서 폴더 JSON에 저장, 앱 재시작 시 "찾는 중"이던 영상만 이어서 검출
- **클라이머 따라가기**: 구간 안에서 가장 오래 잡힌 사람의 골반 경로(±0.75초 평균)를 따라 9:16으로 잘라 1080×1920 H.264로 내보냄(오디오 유지). 확대 비율은 몸통 크기로 정해 구간 내내 고정. 트림 화면 스위치로 켜면 저장 전 미리보기(네이티브 `followPath`로 경로만 받아 VideoView를 창 안에서 이동)까지 됨. 맥에서 36초 클립 13초
- **안드로이드 모듈 완성** (`modules/climb-video/android`, Kotlin). 자르기·따라가기는 Media3 Transformer 1.8.0(expo-video와 버전 맞춤), 검출은 ML Kit 자세 인식 **accurate** 18.0.0-beta5(기본 모델은 벽 무늬를 사람으로 오인하는 유령이 많았음). 프레임은 MediaCodec 순차 디코딩(`FrameSource`) 초당 5장. 유령 대책: 자세 타당성(어깨>골반>발목, 다리 길이 몸통의 0.6~3.5배)과 8초 넘게 거의 안 움직이는 추적 제거. 추적 이어 붙이기 한도 6초. 1.MOV 검출 13.2~47.4초로 iOS(13.2~48.2)와 일치. 에뮬레이터 Pixel_7(소프트웨어 HEVC)에서 139초, 실기기 미측정. 자르기·따라가기 저장 에뮬레이터에서 확인. 안드로이드에 없는 것: 들고 찍은 영상 판별(항상 fixed), 사진 ID 중복 방지(선택기가 ID를 안 줌)
- 목록 화면: "영상 고르기" 버튼을 아래로, 위에 제목·전체 비우기

- **암장 도감 착수**. 카카오 로컬 API(캡시 앱 키, `.env`)로 전국 529곳 수집(`data/gyms.json`, 원본 `data/gyms-raw.json`, 스크립트 `--offline`으로 필터만 재실행 가능). 하단 탭(영상·도감), 도감 화면(지역 칩 → 구별 격자, 실루엣/사진, 방문 횟수), 암장 페이지(사진 바꾸기, 방문 등록, 그 암장 클립), 위치 체크인 배너(200m). expo-location 추가로 양쪽 재빌드 필요. 설계 결정은 roadmap.md 2번

## 다음에 할 일
- 도감: 실기기에서 체크인 배너·카메라·사진 저장 확인. 공유 카드, 뱃지는 그다음
- 안드로이드 실기기 확보해 검출 속도 측정. 디버그로 샘플을 보려면 detect()에서 people을 cacheDir/detect.csv로 쓰고 `adb shell run-as com.climbdex.app cat cache/detect.csv`
- 안드로이드 사진 선택기 중복 방지: 파일 크기+길이로 보조 판별
- 실기기에서 타임라인 드래그(스크롤 간섭 여부)·여러 구간 저장 → 사진 앱 확인
- 들고 찍은 영상 하나 확보해 카메라 이동량 기준값(현재 0.05) 확정
- 검출 로그(`console.log`)와 detect 결과의 `info` 진단 필드 정리
- 출시 준비: 앱 아이콘·이름, 첫 실행 안내, 권한 거부 안내

## 막힌 것 / 함정
- 실기기(iPhone 13 Pro, iOS 26.6.2) 빌드는 **Xcode 16.2로 됨**(8/12 회사 앱을 같은 폰에 올린 기록 있음). Xcode 26·macOS 업데이트 불필요. 막힌 건 개발용 서명 인증서 하나: "Apple Development: 현우 김"이 2026-08-29 만료됨. `expo run:ios --device`가 "No code signing certificates are available"로 실패. Xcode → Settings → Accounts → 계정 선택 → Manage Certificates → + → Apple Development로 재발급 후, 개인 Apple ID 팀이면 `app.json`의 `ios.appleTeamId`에 팀 ID 넣기. 기기 UDID는 devicectl의 UUID가 아니라 `00008110-0011056C1428401E`
- Vision 사람 상자 검출은 벽에 붙은 자세를 못 잡음. 관절 추정(발목)을 쓸 것
- **시뮬레이터에서 관절 추정이 안 됨**. 런타임(17.5·18.3·18.5 전부)에 `cnn_human_pose.espresso.weights`가 빠져 있어 `VNDetectHumanBodyPoseRequest`가 "Unable to setup request"로 실패, 앱에선 "검출 실패" 알림. 검출 확인은 실기기 또는 `scripts/detect.swift`(맥)로만 가능
- 로컬 모듈 설정은 `platforms: ["ios"]` + `ios` 키 형식. `apple`로 쓰면 SDK 54에서 "doesn't support iOS platform"으로 조용히 빠짐
- 모듈 podspec 배포 타깃은 Podfile 기본값 15.1 이하여야 링크됨
- `xcrun simctl addmedia`는 한글 경로 파일을 PHPhotosErrorDomain -1로 거부. ASCII 경로로 복사한 뒤 넣을 것
- CocoaPods는 homebrew `pod`(1.16.2) 사용
- gh 기본 credential helper는 비활성 계정 토큰을 안 줌. 개인 노트북에서 clone하면 `git config credential.helper '!f() { echo username=Hyuunw00; echo "password=$(gh auth token --user Hyuunw00)"; }; f'` 필요
