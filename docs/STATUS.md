# STATUS

## 마지막에 한 일 (2026-09-30, 회사 맥)
- 노트북 커밋을 당긴 뒤 `npm install`·`pod install`·양쪽 재빌드. iPhone 13 Pro와 에뮬레이터 Pixel_7 둘 다 최신 코드로 올라감
- **도감 탭을 셋으로 분리**(JS만, 재빌드 불필요). 홈 `DexScreen`: 체크인 배너 + 내 암장 격자(방문한 곳만, 최근 방문순) + 아래 "오늘 어디 갈까요?" 묶음("오랜만에 가 볼까요?" = 가 본 암장 중 7일 이상 안 간 곳 오래된 순 전부, "근처 새 암장 가 볼까요?" = 안 가 본 곳 거리순 5곳, 위치 권한 있을 때만). 모은 게 없으면 격자는 빈 채로. `AllGymsScreen`: 예전 홈이던 지역 카드→구별 격자·검색을 그대로 옮김. `HistoryScreen`: 월 캘린더(방문일에 지역색 점, 날짜 누르면 그날 암장)만. 추천을 기록 화면에 뒀다가 홈으로 되돌림(결정 순간에 여는 화면이 홈, 캘린더는 날짜 축이라 안 맞음, 빈 홈에 누를 곳이 생김). App에 `dexView` 상태, 도감 탭을 다시 누르면 홈으로
- 진행 바·암장 카드·암장 줄은 두 화면 이상에서 쓰여 `src/components/dex.tsx`로 뺌(`Progress`·`GymCard`·`GymRow`·`formatAgo`). `src/store/dex.ts`에 `lastVisits`
- **새 기능 결정: 시도 분석(동작 코칭)**. 사용자가 원한 "사지별 힘 %·완등 확률 오르는 다음 홀드"는 영상에 없는 정보라 빼고, 측정→루트 인식→완등 시도 비교→코칭 문장 4층으로 재설계. 첫 버전은 기술 코칭까지, 학습 없음, 삼각대·정적부터. 설계·규칙 표·통과 기준은 `docs/exp-02-move-analysis.md`, 결정은 roadmap 4번. 실험 도구 `scripts/joints.swift`(관절 15개 CSV 덤프, 1.MOV 13~20초 70프레임 2초에 확인) 준비됨. **사용자가 완등·낙하 영상을 주면 1층 실험 시작**
- **시도 분석 1층을 앱에 구현**(양쪽 재빌드 필요). 네이티브 `joints(uri, start, end, fps)`가 관절 15개를 프레임마다 돌려주고(iOS는 `scripts/joints.swift` 본문 복사, Android는 `PoseSampler.joints`로 ML Kit 랜드마크를 같은 순서로), 판단은 전부 JS `src/analysis/moves.ts`(무브 순서, 하강 검출, 완등/낙하 분류, 직전 무브, 골반 정체, 뻗기 전 발 무브 유무, 팔꿈치 굽힘 비율, 검출률, 관찰 문장). 규칙이 JS 한 곳에만 있어 세 군데 동기화 대상이 아님. 트림 화면 구간 칩 아래 "이 시도 분석 ›" 줄 → **별도 `AnalysisScreen`**(사용자 결정: 자르기와 돌아보기는 다른 화면). 영상 + 무브 마커 띠(손 빨강·발 파랑, 낙하 빨간 선, 띠 끌어 탐색) + 판정·관찰 문장 + 무브 순서(누르면 그 시점). 열 때 저장된 결과 없으면 자동 분석. 결과는 `PickedVideo.analyses[구간키]`에 저장. TS 포팅은 파이썬 스크립트와 세 영상에서 판정 일치 확인(`scratchpad` 검증 스크립트)
- 기능 논의 결과: 홀드 색 자동 인식(난이도는 홀드 색이 아니라 **테이프 색**이라 불가), 클립 띠 색·완등 태그 수집(쓸 데가 약함), 사진 앨범 스캔으로 도감 채우기(앱을 쓴 이유로만 채우기로)은 전부 기각. 남은 후보는 낙하 영상 동작 분석인데 힘·다음 홀드 추천은 2D 영상으로 불가하고, 관절 데이터로 사실만 보여주는 형태는 실험(exp-02) 뒤 판단. 사용자가 홈·기록 화면을 보고 다음 요청

## 마지막에 한 일 (2026-09-29, 개인 노트북)
- **개인 노트북 세팅 완료**. clone → `npm install` → `npm run ios:device`로 iPhone 13 Pro에 올라감. 도감 실기기 확인은 아직
- 새 맥 첫 빌드 함정: 프로파일이 없어 `expo run:ios`가 "No profiles for 'com.climbdex.app'"로 실패(expo CLI가 `-allowProvisioningUpdates`를 안 넘김). `ios/`에서 아래를 한 번 돌려 프로파일을 만든 뒤 `npm run ios:device`
  `xcodebuild -workspace climbdex.xcworkspace -scheme climbdex -configuration Debug -destination 'platform=iOS,id=00008110-0011056C1428401E' -allowProvisioningUpdates -allowProvisioningDeviceRegistration build`
- 인증서 이름 `Apple Development: … (2H37NQFNKW)`의 괄호 ID는 **인증서 ID**, 팀은 OU(`UZTXXV5UD5`). 팀 ID로 착각해 app.json을 바꿨다가 "No Account for Team"으로 실패, 되돌림. `app.json`은 `UZTXXV5UD5` 그대로
- 서명 때 키체인 암호 창은 맥 로그인 비밀번호, "항상 허용"으로 눌러야 바이너리마다 안 물어봄
- 노트북 Xcode는 `~/Desktop/Xcode(16.2).app`가 xcode-select 대상(/Applications엔 16.4도 있음). 디스크가 꽉 차 있어 DerivedData·npm/Yarn/CocoaPods 캐시 지우고 28G 확보
- Metro는 사용자가 직접 띄움(8081)
- 도감 정리 셋: `dayKey`를 로컬 날짜로(UTC라 한국 오전 9시에 날이 바뀌던 문제), 도감 사진을 expo-image-manipulator로 720px JPEG로 줄여 저장(원본 3~4MB가 격자에 그대로 올라가던 문제, **양쪽 재빌드 필요**), 방문 삭제·사진 교체 때 안 쓰는 파일 삭제(`removeVisit`·`replacePhoto`). 미방문 암장은 사진 못 넣게 막음
- 도감 논의 결과: 목록 갱신은 서버 단계로 미룸(roadmap 2번), 띠레벨 표 입구는 클립에 띠 색 달기로(roadmap 3번). 체크인 반경은 유지로 확정, 반경 안 후보가 둘 이상이면 **도장 받는 순간**에 고르게 함(배너는 제일 가까운 한 곳만 표시). 고르기·사진·등록·이동은 App `checkIn(candidates)` 한 곳. GymScreen `locate()`가 후보를 만들어 넘김. JS만 바뀜. 암장 페이지에서 나오면 지역 선택으로 튕기던 문제는 `region`·`query` 상태를 App으로 올려서 해결(DexScreen이 암장 페이지·탭 전환 때 언마운트됨)
- 도감 수집감 셋: **실루엣 다양화**(`Silhouette`에 `seed`=gym.id, 해시로 홀드 모양 6종(저그·크림프·슬로퍼·핀치·포켓·볼륨), 색은 미방문 한 톤·방문은 지역(region1) 색 16종 `regionColor`), **뱃지는 도감 화면에서 뺌**(사용자 결정: 나중에 별도 '뱃지 도감' 화면으로. 계산 로직 `src/data/badges.ts`는 안 쓰는 채로 남겨둠), **등록 순간 연출**(`Celebration`, 방문 등록마다 전체 화면 오버레이: 실루엣→사진 뒤집기 + 성공 햅틱, "도감에 등록!" 또는 "N번째 방문", 눌러서 닫기). expo-haptics 추가로 **양쪽 재빌드 필요**
- 트림 화면 "처음으로": 편집한 구간(`clips`)을 지워 검출 직후 상태로 되돌림. 편집한 적 있을 때만(`video.clips` 있을 때) 상태 줄 오른쪽에 뜸
- iOS `detect`를 전용 직렬 큐(`climbdex.detect`)로 뺌. Expo `AsyncFunction` 기본 큐는 모든 모듈이 공유하는 직렬 큐라 검출 중엔 thumbnails·followPath·exportFollow와 file-system·media-library 호출까지 대기했음. 영상끼리 병렬은 아님(JS 루프도 순차, Vision이 CPU를 다 써서 병렬 이득 없음). 안드로이드는 원래 `Dispatchers.IO`라 해당 없음

## 회사 맥에서 한 일 (2026-09-29)
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
- 도감 홈·전체 도감·내 기록 세 화면을 실기기에서 확인(빈 홈, 추천 두 줄, 캘린더 점·날짜 선택)
- 시도 분석: 폰에서 IMG_5110(낙하)·IMG_5634(완등)로 결과 카드 확인, 사용자 정답(낙하 시각·직전 무브·먼저 빠진 사지)과 대조. 안드로이드 에뮬레이터에서도 `joints` 동작 확인
- 시도 분석 다음: 완등/낙하 판정을 사용자가 뒤집는 버튼, 관찰 문장 "아니에요" 라벨, 폰 처리 시간 측정(10fps 관절이라 검출보다 2배 프레임)
- exp-02 1층 실험: 사용자 영상 받으면 `joints.swift`로 CSV → `analyze-joints.py`로 무브 순서표·골반 궤적·낙하 사지 → 사용자가 영상 보고 적은 정답과 대조. 통과 기준은 exp-02 문서
- 도감: 실기기에서 체크인 배너·카메라·사진 저장 확인. 공유 카드, 뱃지는 그다음
- 도감: 실기기에서 등록 연출(뒤집기·햅틱)·홀드 실루엣 6종 눈으로 확인
- 뱃지: 나중에 별도 화면(뱃지 도감)으로. 도감 화면에는 안 넣음
- 안드로이드 실기기 확보해 검출 속도 측정. 디버그로 샘플을 보려면 detect()에서 people을 cacheDir/detect.csv로 쓰고 `adb shell run-as com.climbdex.app cat cache/detect.csv`
- 안드로이드 사진 선택기 중복 방지: 파일 크기+길이로 보조 판별
- 실기기에서 타임라인 드래그(스크롤 간섭 여부)·여러 구간 저장 → 사진 앱 확인
- 들고 찍은 영상 하나 확보해 카메라 이동량 기준값(현재 0.05) 확정
- 검출 로그(`console.log`)와 detect 결과의 `info` 진단 필드 정리
- 출시 준비: 앱 아이콘·이름, 첫 실행 안내, 권한 거부 안내

## 막힌 것 / 함정
- 다른 기기에서 당긴 뒤 `package.json`이 바뀌었으면 `npm install` → `pod install` → 양쪽 재빌드. 안 하면 Metro가 "Unable to resolve expo-haptics"로 멈추고, 안드로이드는 그 오류 화면을 누르면 dev launcher가 NPE로 죽음(Expo 버그)
- 방문 등록을 암장 밖에서 테스트하려면 `src/components/dex.tsx`의 `SKIP_DISTANCE_CHECK`를 `true`로. 암장 페이지 "도감에 등록"의 거리 거절만 건너뛰고 후보 목록·배너 반경은 그대로. 커밋엔 `false`
- 실기기(iPhone 13 Pro, iOS 26.6.2) 빌드는 **Xcode 16.2로 됨**(8/12 회사 앱을 같은 폰에 올린 기록 있음). Xcode 26·macOS 업데이트 불필요. 막힌 건 개발용 서명 인증서 하나: "Apple Development: 현우 김"이 2026-08-29 만료됨. `expo run:ios --device`가 "No code signing certificates are available"로 실패. Xcode → Settings → Accounts → 계정 선택 → Manage Certificates → + → Apple Development로 재발급 후, 개인 Apple ID 팀이면 `app.json`의 `ios.appleTeamId`에 팀 ID 넣기. 기기 UDID는 devicectl의 UUID가 아니라 `00008110-0011056C1428401E`
- Vision 사람 상자 검출은 벽에 붙은 자세를 못 잡음. 관절 추정(발목)을 쓸 것
- **시뮬레이터에서 관절 추정이 안 됨**. 런타임(17.5·18.3·18.5 전부)에 `cnn_human_pose.espresso.weights`가 빠져 있어 `VNDetectHumanBodyPoseRequest`가 "Unable to setup request"로 실패, 앱에선 "검출 실패" 알림. 검출 확인은 실기기 또는 `scripts/detect.swift`(맥)로만 가능
- 로컬 모듈 설정은 `platforms: ["ios"]` + `ios` 키 형식. `apple`로 쓰면 SDK 54에서 "doesn't support iOS platform"으로 조용히 빠짐
- 모듈 podspec 배포 타깃은 Podfile 기본값 15.1 이하여야 링크됨
- `xcrun simctl addmedia`는 한글 경로 파일을 PHPhotosErrorDomain -1로 거부. ASCII 경로로 복사한 뒤 넣을 것
- CocoaPods는 homebrew `pod`(1.16.2) 사용
- gh 기본 credential helper는 비활성 계정 토큰을 안 줌. 회사 맥에서는 `git config credential.helper '!f() { echo username=Hyuunw00; echo "password=$(gh auth token --user Hyuunw00)"; }; f'` 필요. 개인 노트북은 Hyuunw00이 gh 활성 계정이라 osxkeychain 그대로 됨
