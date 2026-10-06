# STATUS

## 마지막에 한 일 (2026-10-06 밤, 회사 맥)
- **검출 추적 수정(한 시도가 둘로 갈라지던 문제, exp-01 10-06 항목)**: 몸통 길이 한 프레임 튐·화면 끝 오검출로 같은 사람이 새 추적이 되던 것을 (1) 최근 5개 중앙값도 허용, (2) 확정 구간에 1초 안에 이어지는 점선 후보 흡수로 해결. 맥 11개 영상에서 5794·5815만 고쳐지고 나머지 동일. 세 군데(스크립트·iOS·Android) 다 옮김, **양쪽 재빌드 필요, 앱에서 '전체 비우기' 후 다시 골라야 새 결과**
- 영상 목록 썸네일을 검출 끝나면 첫 시도 구간 가운데 프레임으로 교체(전엔 1초 고정). 저장한 구간은 버튼이 "n번 저장됨 ✓"로 바뀌고 다시 저장은 확인창
- **영상 저장 시 완등 기록(핸드오프 4번 A+B) 구현, 폰 확인 전**. 서버: `supabase/schema.sql`에 `sends`(사용자·암장·시각·띠·완등 여부·근거 location/visit·영상 키·구간, 본인 행만) 추가, `checked_in()`을 "도감 등록 또는 완등 기록 있음"으로 넓힘 → **schema.sql 다시 실행 필요**. 앱: `src/store/sends.ts`(암장 확정 `resolveGyms`: 영상 촬영 위치 300m 안 후보 → 없으면 그날 도감 등록 암장을 촬영 시각 가까운 순 → 없으면 빈 배열, 완등 판정 `judgeSend`: 검출 추적 데이터(5fps 골반 y·몸통)로 exp-02 규칙(0.6초 안 1.5몸통 하강 직전 최고점 ±0.3몸통 정지 1.5초 이상=완등) 포팅, 판정 불가면 기본 완등, `pushSends` upsert), 트림 화면에 **"완등 기록" 구역 상시 표시**(사용자 피드백: 저장 버튼 뒤 시트가 아니라 들어가자마자 보이게): 들어가면 암장을 잡고(후보 여럿이면 알약 선택), 현재 구간의 완등/낙하 토글(자동 판정 기본)·띠 칩(표 있으면 그 암장 띠, 없으면 팔레트 15색), 표 없으면 "아시면 알려 주기" 링크(OrderSheet), 고른 띠에 V 없으면 "투표하기" 링크(VoteSheet), "기록 안 함"으로 끌 수 있음. 저장은 암장이 잡혔으면 띠를 골라야 됨(안 고르면 안내). 저장 뒤 완등 기록 전송. 비로그인·암장 못 잡음이면 구역 없이 지금처럼 저장. 영상 위치는 `getAssetInfoAsync`의 `location`을 `PickedVideo.location`에 저장(검출 시작 때 촬영 시각과 같이 읽음). `Clip`에 `gymId·tape·sent` 보관. 네이티브 변경 없음
- **영상 탭 "오늘 ○○ · 새 영상 N개" 배너 제거**(사용자 결정: 지금 단계에선 헷갈림, 필요하면 나중에). 날짜만 보고 카톡으로 받은 영상까지 세던 것. 근처 암장 "도감에 등록하고 사진 찍기" 배너는 유지. `todayVideos.ts`엔 배너 닫기 기록만 남음
- 트림 화면 흐름 다듬기(사용자 피드백 반영): 저장 시트 대신 상시 구역(암장 ▾ / 완등|낙하 세그먼트 / 띠레벨 칩), 설명 문구 없음, "기록 안 함"↔"다시 켜기". 저장 누를 때 표 없는 암장이면 띠 순서 시트, 고른 띠에 내 투표가 없으면 V 투표 시트가 **먼저** 뜨고 한 번 누르면 투표·저장이 같이 진행. X는 저장까지 취소, "모르겠어요 · 그냥 저장"만 건너뜀. 투표는 단일 V(범위 없앰). 영상 암장 반경 200m. 위치 없는 영상은 촬영일 → 앱에서 고른 날(`pickedAt`)의 도감 등록 암장. 카톡 영상은 위치가 지워지고 촬영일·수정일 모두 보낸 시각으로 박혀 수정일은 못 씀
- 시드에 체인 복사 추가: 같은 브랜드 3곳 이상이 같은 표면 표 없는 지점에 복사(몽키즈 13곳), 작은 체인(손세동·킹콩·레드포인트·타기)은 1곳 기준 복사. grades.json 260곳(V 231), 시드 재적용됨
- `SKIP_DISTANCE_CHECK` 테스트 후 false로 되돌림

## 이전 (2026-10-06 저녁, 회사 맥)
- **띠레벨 표 1단계 구현(앱·SQL 완료, 서버 적용·폰 확인 전)**. 서버: `supabase/schema.sql`에 `gym_tapes`(암장당 한 행, `tapes` jsonb 쉬운 순서 배열, source seed/user)·`tape_votes`(사용자×암장×띠 1표, V 범위)·`tape_reports`(신고: order/v·띠·메모·체크인 여부) + RLS(읽기는 전부, 띠 표 입력·투표는 `checked_in(gym)` 함수로 방문 기록 있는 사용자만, 신고는 로그인만). 시드: `scripts/seed-tapes.py` → `supabase/seed-tapes.sql`(243곳 upsert, source='user' 행은 안 덮음). **Supabase MCP가 이 프로젝트에 권한이 없어 사용자가 SQL Editor에서 schema.sql의 추가분 → seed-tapes.sql 순서로 직접 실행해야 함**
- 앱: `src/store/tapes.ts`(조회·투표·신고·띠 순서 저장, 집계는 시드 추정이 있는 띠는 3표부터 투표 중앙값, 추정 없는 띠는 첫 표부터), `src/components/TapeSection.tsx`(암장 페이지 "띠 난이도" 섹션: 색 칩 가로 스크롤 + V 범위 + 투표 수, 칩 누르면 V 투표 시트(한 번 누르면 등급, 더 높은 걸 한 번 더 누르면 범위), "표가 틀렸나요? 신고하기" 시트(종류·띠·메모), 표 없으면 "띠 순서 알려 주세요" 시트(팔레트 15색을 쉬운 순서로 탭)). 섹션은 `types`가 비었거나 볼더링 포함인 암장만. 비로그인은 로그인 유도, 미방문은 안내만. GymScreen에 `userId`·`onNeedAuth` prop 추가. JS만이라 재빌드 불필요, `tsc` 통과
- 사용자 결정: 표 없는 암장은 체크인 때 묻지 않고 **영상 저장 때**(핸드오프 4번) 띠 순서만 입력, V는 투표로. 1단계에선 암장 페이지 버튼으로 대신함

## 이전 (2026-10-06 오후, 회사 맥)
- **spiri7 띠→V 데이터 병합 완료**: `data/grades.json` 83곳 → **243곳(V 214곳)**. 스크립트 `scripts/spiri7-grades.py`(좌표 300m+이름 유사도 매칭, 재실행 가능). 커뮤니티 시트와 겹친 73곳 교차 검증은 피커스·알레·고고 등 순서 일치, 더클라임은 시트에 핑크만 빠졌던 것. 기록 11건 이상이면 spiri7 우선. 상세는 `docs/research/grades-research.md`
- spiri7에만 있는 실내 암장 255곳은 카카오 원본에도 없어 **폐점으로 간주**(사용자 결정). 유일한 수집 누락 락트리 분당은 `collect-gyms.mjs` 필터 버그("트리클라이밍" 제외에 "락트리클라이밍"이 걸림)였고, 고쳐서 `--offline` 재실행. 이어서 주차장·빙벽장·키즈·협회·2026년 예정 등 **비암장 19곳을 `NOT_GYM`으로 제외 → gyms.json 511곳**(다른 항목 변화 없음). 손상원 잠실은 같은 주소의 클라임투더문(spiri7 기록이 3배 많고 sid도 나중)으로 대체된 걸로 보고 그쪽 표 사용
- **종류 칸 `types`** 추가(볼더링·리드·지구력, spiri7 종목 칸 + 이름 규칙, 358곳. 모르는 곳은 빈 배열). `scripts/spiri7-grades.py`가 `gyms.json`에 써 넣으므로 `collect-gyms.mjs --offline` 뒤엔 꼭 이어서 실행. 암장 페이지 헤더에 "서울 강남구 · 실내 · 볼더링 · 지구력"처럼 표시(JS만, 재빌드 불필요, 폰 확인 전)
- 띠 없이 V 표기를 쓰는 암장(두드림·더클라이밍짐)은 라벨 V 그대로 grades.json에 넣음. Vb~V16 20단계 통째는 spiri7 기본값이라 버림
- 사용자가 다니는 암장 표 눈 검증은 아직(사용자에게 더클라임·피커스·서울숲·손상원·알레·클라이밍파크 표 보여 줌)

## 이전 (2026-10-06 오전, 회사 맥)
- **띠레벨 표 방향 재설계**(roadmap 3번 갱신): 경쟁 앱 ClimPick 분석 → SNS·기록 기능은 뺀 채로 암장별 띠색→V 표를 먼저, 완등 기록(영상 자동 판정+띠 색 한 탭, 완등만 서버)은 다음, 랭킹·레이팅은 사람 모인 뒤
- **전국 암장 띠색→V 조사** → `data/grades.json`(83곳 띠 순서, 72곳 V 추정, 전부 커뮤니티·블로그 출처의 초안). 기록은 `docs/research/grades-research.md`. 몽키즈 23곳과 지방 독립 암장은 못 찾음. spiri7 앱에 같은 표가 있지만 경쟁 서비스 자산이라 사용 여부는 사용자 결정 대기
- 주말 노트북 커밋(18개) 머지. 충돌은 App.tsx import 한 줄과 STATUS.md 세션 기록뿐. 머지 커밋 `aa85d8b`, 미푸시
- **회사 맥 Xcode 26 전환**. 노트북 코드가 iOS 26 API(`BGContinuedProcessingTask`)를 써서 Xcode 16.2로는 컴파일 불가. macOS 15.5→15.8.1, `/Applications/Xcode-26.3.app` 추가(16.2 `Xcode.app`은 유지, 회사 앱용). Sequoia에서 되는 마지막 Xcode가 26.3(26.4+는 macOS 26 필요). 전환은 `sudo xcode-select -s /Applications/Xcode-26.3.app`, 회사 앱은 `… -s /Applications/Xcode.app`
- `npx expo prebuild`(clean 없이) → pod install → 아이폰 디버그 빌드 설치, Metro 연결 확인. 디스크 정리로 DerivedData·옛 DeviceSupport·npm/CocoaPods 캐시 35GB 비움

## 막힌 것 / 함정 (2026-10-06)
- **Xcode 26.3 + 런타임**: 실기기 빌드도 iOS 플랫폼 런타임이 있어야 함("iOS 26.2 is not installed"). `xcodebuild -downloadPlatform iOS`로 받은 26.3.1은 actool이 안 받아 빌드 실패("No simulator runtime version from [...] available to use with iphonesimulator SDK 23C57"). **Xcode 앱을 열어 첫 실행 구성 요소 창(또는 Settings → Components)에서 iOS 26.2를 받으면 됨**. 그 뒤 같은 26.3.1 이름으로 등록되지만 빌드 통과
- **prebuild 뒤 iOS 빌드 전 두 가지**: (1) `ios/climbdex/climbdex.entitlements`에서 `aps-environment` 삭제(expo-notifications가 넣는 푸시 권한, 개인 팀 불가, 노트북 10-03 기록과 동일), (2) 프로파일 없으면 expo CLI가 자동 생성 옵션을 안 넘기므로 `ios/`에서 `xcodebuild -workspace climbdex.xcworkspace -scheme climbdex -configuration Debug -destination 'platform=iOS,id=00008110-0011056C1428401E' -allowProvisioningUpdates -allowProvisioningDeviceRegistration build` 한 번. 설치는 `xcrun devicectl device install app --device … <DerivedData>/Build/Products/Debug-iphoneos/climbdex.app`
- 안드로이드 `android/app/build.gradle`의 릴리스 서명 블록은 clean 없는 prebuild에선 유지됨(확인)
- 안드로이드 에뮬레이터 디버그 빌드는 주말 네이티브 변경(expo-notifications·keep-awake·모듈) 반영 전. 다음 안드로이드 확인 때 재빌드 필요
- 시뮬레이터 런타임 iOS 26.3.1이 두 번 받아져 25GB 차지(`/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime`). 정리는 `xcrun simctl runtime list` 후 `delete`

## 마지막에 한 일 (2026-10-04, 개인 노트북)
- **임시 앱 아이콘**(사용자 결정: 정체성이 바뀔 수 있어 Expo 기본 아이콘만 피함). 검정 배경 + 흰 크림프 홀드(위쪽 립 선, 볼트 구멍). `assets/`의 icon·android-icon 셋·splash-icon·favicon 교체, app.json `android.adaptiveIcon` 연결(전엔 안 쓰였음). 생성은 Swift 스크립트(세션 scratchpad, 저장 안 함). 다음 빌드부터 반영, iOS는 `prebuild` 필요할 수 있음
- 소개 릴스 1편(자르기 기능) 업로드 완료. 2편은 따라가기 비포/애프터
- **체크인 ↔ 영상 연결**(JS만, `src/todayVideos.ts`): 오늘 체크인이 있으면 영상 목록 위에 배너. iOS는 사진 접근 권한이 이미 있으면 `expo-media-library`로 오늘 찍은 5초 이상 영상 중 목록에 없는 것(assetId=localIdentifier로 비교)을 세어 "오늘 ○○ · 새 영상 N개" → 누르면 선택기 없이 바로 추가·검출. 다 처리했으면 배너 없음. 안드로이드·권한 없음은 수 없이 "오늘 ○○ 다녀왔네요 → 찍은 영상 고르기"(사진 선택기, 고르면 그날 배너 닫힘). 안드로이드에서 안 세는 이유: 선택기 URI는 MediaStore ID와 매칭 안 되고, `READ_MEDIA_VIDEO`는 Play 사진·동영상 권한 정책에 걸릴 위험. ×로 닫으면 그날은 안 뜸. 같은 날 두 암장이면 마지막 체크인 이름. 앱이 앞으로 올 때마다 다시 셈. **실기기 미확인**. 체크인 때 저녁 알림 예약은 써 보고 결정
- **앱 열 때 근처 암장 체크인 배너**(사용자 제안, JS만): 도감 홈에만 있던 "○○에 있네요" 배너를 영상 탭에도. 앱이 앞으로 올 때마다 위치 확인(이미 받은 '사용 중 허용'만, 권한 요청 안 함), 반경은 기존 체크인 규칙(`allowedMeters`, 100m 또는 GPS 오차) 그대로. 근처 후보 중 오늘 체크인한 곳이 있으면 안 뜸. 누르면 기존 체크인 흐름(여러 곳이면 고르기 → 사진 → 등록), 영상 탭에 머묾(`checkIn(candidates, false)`), 게스트는 로그인 시트. 체크인 후엔 "오늘 ○○ · 새 영상 N개" 배너로 이어짐. 백그라운드 위치 감시(지오펜스)는 지나갈 때마다 알림이 와서 기각. 배너 ×는 그날만 숨김(`Documents/today-dismissed.json`, 키 `videos`·`checkin:<gymId>`)

## 마지막에 한 일 (2026-10-03, 개인 노트북)
- **실제 세션 영상으로 검출 점검**. 사용자가 9개 영상(1.5~6.5분, 1920×1440 HEVC 30fps)을 폰에서 돌린 로그: 합계 27.8분 영상에 5.2분, 실시간의 0.19배. 카톡 전송본 5개(960×720)와 IMG_6635 원본으로 맥 재현(원본은 폰과 결과 동일, 25초). 놓친 시도의 원인은 셋이고 **사람을 못 잡은 건 없었음**: (1) 겹치는 사람 무조건 합치기(IMG_6644), (2) 유령 추적이 클라이머 추적을 가로챔(IMG_6644), (3) 발이 매트 근처에 머무는 시도(IMG_6635 오버행 스타트에서 떨어짐, IMG_6637·6646 낮은 홀드). 상세는 exp-01
- 검출 수정 둘(`scripts/detect.swift` → iOS 모듈 → 안드로이드 `Segmenter.kt`·모듈): 겹치는 구간은 같은 사람일 때만 합침(`sameSpot`), 같은 좌표에 8초 이상 머문 샘플 제거(`dropStatic`, 안드로이드는 PoseSampler에 이미 있어 미적용). 맥 7개 영상(원본 1·카톡 5·IMG_5899)에서 6개 결과 동일, IMG_6644만 유령 구간 사라지고 두 클라이머 분리. "추적 놓치면 조각 검출" 시도는 차이 없어 되돌림. **안드로이드는 이 노트북에 android/ 없어 미빌드**, 회사 맥에서 확인 필요. 스크립트는 합치기 전 구간(`raw …`)과 CSV에 x·y를 추가로 찍음
- **후보 구간 + 트림 화면 보강**(사용자 결정 "일단 해봐"). 네이티브 detect가 `candidates`(8초 이상 연속 등장, 확정 구간과 안 겹침)를 같이 돌려줌(스크립트·iOS·안드로이드 세 군데, 안드로이드 미빌드). 사용자가 9개 영상에서 후보가 대부분 진짜 시도라고 확인해 **후보도 처음부터 구간으로**(`Clip.low`, 화면엔 점선 테두리만. "낮음" 글자·설명 문구는 사용자가 불필요하다 해서 뺌. "모든 구간 저장"에 포함, 가짜는 ×로 제거). 목록의 "구간 N개"는 확정+후보 합. 스크럽을 구간 밖으로 풀고 플레이헤드도 밖으로 나감. 버튼 글자는 "재생"/"일시정지" 하나로(구간 안이면 구간 끝에서 멈추고, 밖이면 계속 재생). 들어갈 때·이전/다음으로 넘어갈 때 첫 구간 자동재생. 구간 추가 버튼은 넣었다가 사용자가 불필요하다 해서 뺌. 목록엔 "후보 N개". 근거는 exp-01 '후보 구간'
- IMG_6643 4번째 구간(149~279초 2분 덩어리) 원인: 끊긴 추적 재연결 반경이 10초 뒤 화면 전체가 돼 다른 사람들이 한 추적으로 이어짐 + 232초 카메라 이동. **재연결 반경 상한 0.4** 추가(스크립트·iOS·안드로이드 `PoseSampler.kt`, 안드로이드 미빌드). 카메라 이동 시점 끊기는 정합 이동량이 지나가는 사람에 반응해 폐기. 상세 exp-01
- 폰에서 확인하려면 "전체 비우기" 후 다시 골라야 함(옛 결과가 목록에 저장돼 있음)
- **기다림 UX**(`src/detectProgress.ts`): 검출 큐 진행률을 목록 제목 아래 "3/9 찾는 중 · 약 4분 남음 · 화면을 켜 두세요"(남은 시간은 이 세션에서 처리한 영상의 초당 비율로 추정, 첫 영상은 0.2배 가정). 검출 중엔 expo-keep-awake로 화면 안 꺼짐. 전부 끝나면 앱이 앞에 있으면 성공 햅틱, 뒤에 있으면 로컬 알림(expo-notifications, "시도 구간을 다 찾았어요 · 영상 N개 · 구간 M개"). 알림 권한은 영상을 처음 고를 때 요청. iOS는 앱을 내려놓으면 수십 초 뒤 멈추므로 알림은 그 안에 끝났을 때만 옴. **네이티브 둘 추가라 양쪽 재빌드 필요**
- **시도 모아보기 격자는 만들었다가 뺌**(사용자: 오히려 번거로움). 대신 트림 화면 상단에 "‹ 3/9 ›"로 목록 안 거치고 이전·다음 영상으로 넘어감(App이 `key={uri}`로 화면을 새로 띄움). 공통 구간 계산 `src/clips.ts`(`clipsOf`·`padded`)는 유지, 트림 화면 저장에 `Clip.saved` ✓ 표시
- **Xcode 26.6 전환 완료**(노트북): `/Applications/Xcode-26.6.app`, xcode-select·라이선스·first launch는 사용자가 터미널에서 sudo로. Xcode 26은 iOS 플랫폼을 따로 받아야 함(`xcodebuild -downloadPlatform iOS`, 8.5GB, 시뮬레이터 포함) — 안 받으면 "iOS 26.5 is not installed"로 실기기 빌드도 실패. 이후 `npx expo run:ios --device <UDID> --no-bundler` 정상. 회사 맥도 같은 순서 필요. CLAUDE.md의 'SDK 54 고정, 올리려면 Xcode 26 필요'는 이제 SDK 업그레이드도 가능하다는 뜻
- 검출 수정 둘(사용자 승인, 스크립트·iOS·안드로이드): 추적 바통터치 합치기(틈 1초 미만, IMG_6643 쪼개짐), 시작점 거슬러 찾기에 4초 머무름 조건(IMG_6649 앞 11초 잘림). 근거·비교표는 exp-01. iOS·안드로이드 미빌드(Xcode 26 iOS 플랫폼 다운로드 대기)
- **iCloud 받는 동안 다른 영상이 막히던 것**: 로그로 확인(IMG_9408 iCloud 받기 15.4초·9457 28.9초, 보관 복사 1ms, 다 받은 뒤 트림 열기 resolve 0ms·재생 준비 28ms·장면 12장 10ms). 원본 받기가 목록 썸네일 작업 안에서 Expo 공용 직렬 큐를 붙잡아, 이미 받은 영상의 트림 화면·썸네일까지 그 뒤에서 기다렸음. iOS `thumbnails`·`resolveUri`·`followPath`·`exportFollow`·`exportCrop`·`cropPlan`을 전용 동시 큐(`climbdex.media`)로 옮기고, 같은 영상을 두 곳에서 동시에 받지 않게 영상별 잠금. 개발 빌드에서 네이티브 로그를 1초마다 Metro로(`drainLogs`, `[native] …`). 실기기 확인: 다음 영상이 iCloud에서 받는 중에도 IMG_9505 트림 화면 재생 준비 35ms, 장면 12장 341ms
- **따라가기·iCloud 영상 속도**(사용자 보고: iCloud 영상은 트림 화면 열기와 따라가기가 느림): (1) detect가 사람별 샘플(`tracks`: [t, x, y, torso, ankleY], 소수 셋째 자리)을 같이 돌려주고 영상 목록에 저장, `followPath`·`exportFollow`가 그걸 받아 다시 분석하지 않음(예전 영상처럼 없으면 기존대로 분석). iOS·안드로이드 둘 다. (2) iOS `resolveURL`이 폰에 원본이 있으면 사진 앱 파일을 그대로 쓰고, iCloud에서 받아야 했던 것만 `Caches/icloud-originals/<sha>.mov`로 복사해 앱을 다시 켜도 다시 받지 않음. 목록에서 지우면 `releaseVideo`로 삭제, 앱 시작 때 `cleanupOriginals`로 목록에 없는 것 정리. 실기기 확인: 사용자가 "영상도 바로 로드되고 클라이머 따라가기도 바로 적용"으로 확인(2026-10-04)
- 검출 수정(사용자 승인, 스크립트·iOS·안드로이드): 시작점 찾을 때 매트 높이를 그 사람이 서 있던 높이로(IMG_0652 싯 스타트 16초 누락, IMG_9552 쪼개짐). 6649 두 시도가 붙는 부작용은 감수. 상세 exp-01
- 검출 수정(사용자 승인, 스크립트·iOS·안드로이드): 사람 재연결 허용 거리를 몸통 길이 3배로(IMG_9811 지나가던 사람이 클라이머 추적을 가로채던 것, climbing7 쪼개짐). 24개 영상 비교·기각한 대안은 exp-01. 칩 합치기 UI는 안 만듦(사용자 결정)
- **기본 저장·미리보기를 원본 비율로 되돌림**(사용자 결정): 앱의 역할은 편집 툴로 가기 전 시도 구간을 고르고 시작·끝을 자르는 것이지 릴스용 편집이 아님. 트림 화면은 원본 전체를 보여주고, 저장은 원본 그대로 자르기(`trim`, 재인코딩 없음). 9:16은 클라이머 따라가기를 켰을 때만(미리보기·저장 모두). `exportCrop`·`cropPlan` 네이티브는 남아 있지만 앱에서 안 씀
- **영상 복사 안 하기 + iCloud 원본 받기**(사용자 승인): 영상 고르기에서 PHPhotosErrorDomain 3164(원본이 iCloud에만 있는데 사진 선택기가 내려받지 못함)로 실패. expo-image-picker는 고를 때 무조건 파일을 복사해서, 네이티브에 직접 사진 선택기를 띄우는 `pickVideos` 추가. iOS는 PHPicker(`photoLibrary: .shared()`)로 사진 앱 ID만 받아 `ph://<id>`로 저장, 검출·썸네일·자르기·내보내기는 `resolveURL`이 `PHImageManager.requestAVAsset(isNetworkAccessAllowed: true)`로 원본 파일 주소를 받아 씀(iCloud면 이때 받음, 주소 캐시). 재생은 `resolveUri`로 받은 파일 주소를 플레이어에 넣음. 안드로이드는 시스템 사진 선택기(API 33+ `ACTION_PICK_IMAGES`, 그 아래 `ACTION_OPEN_DOCUMENT`)로 content URI만 받고 영구 읽기 권한을 잡음. 받는 시간은 따로 안 보여주고 "시도 구간 찾는 중"에 포함(사용자 결정). 사진 앱에서 원본을 지우면 그 영상은 못 씀(`AssetMissing`). 예전 방식으로 들어온 영상(file://)은 그대로 동작
- **삭제하면 검출 멈춤**(사용자 요청): 지운 영상은 대기열에서 빠지고, 검출 중이면 `cancelDetect`로 네이티브가 다음 묶음에서 멈춤(체크포인트도 삭제). 완료 알림의 영상·구간 수에서 빠지고, 다 지우면 알림 없이 백그라운드 작업만 조용히 끝냄
- **영상 파일 정리**(사용자 보고: 여러 개 올리기가 안 됨): 사진 선택기가 고른 영상을 `Caches/ImagePicker`에 복사하는데, 삭제·전체 비우기가 목록에서만 빼고 파일은 안 지워 원본(최대 700MB)이 계속 쌓였음. 이제 삭제·전체 비우기 때 파일도 지우고, 앱 시작 때 목록에 없는 복사본을 정리(`src/videoFiles.ts`). 저장 후 남던 내보내기 임시 파일도 사진 앱에 넣은 뒤 삭제. 영상 고르는 동안 버튼에 "영상 불러오는 중…", 실패하면 저장 공간 확인 알림(전엔 에러를 안 잡아 조용히 끝났음)
- 검출 수정(사용자 승인, 스크립트·iOS·안드로이드): 점선과 같은 사람 확정 구간이 겹치면 합침, 점선끼리 틈 3초까지 이어 붙임(IMG_1465 다이나믹 무브가 칩 3개로 나오던 것). 22개 영상 비교는 exp-01. Metro 로그에 `detect low` 줄 추가. 안드로이드 미컴파일
- **로그인 전 둘러보기**(10/01 결정 구현): 로그인 안 해도 도감 탭이 열림. 홈(근처 새 암장·체크인 배너 포함)·전체 도감·암장 페이지는 빈 도감으로 보이고, 방문 등록·사진·내 기록·공유 카드·프로필 칩("로그인")은 `AuthScreen`을 아래에서 올라오는 시트로 띄움. 로그인하면 시트가 닫히고 보던 화면 그대로. 홈 목록 위에 "로그인하면 다녀온 암장이 여기 모여요" 안내
- 도감 암장 페이지 "이 암장에서 저장한 클립"(사용자 결정): 방문한 날 찍은 영상 중 `Clip.saved`인 구간만, 클립마다 가운데 프레임 썸네일과 길이. 누르면 그 영상 트림 화면. `Clip.saved` 생기기 전에 저장한 건 안 보임. 도감 사진 "클립 썸네일로"는 그날 영상 썸네일 그대로
- 영상 목록 스크롤바가 "삭제" 위에 겹치던 것: 화면 좌우 여백을 목록 안쪽으로 옮김
- 안드로이드 컴파일 시도(노트북, `npx expo prebuild -p android` 후 `./gradlew :climb-video:compileDebugKotlin`): 첫 시도는 메모리 부족(스왑 3.3GB)으로 Kotlin 데몬이 멈춤, 두 번째(`--no-daemon -Pkotlin.compiler.execution.strategy=in-process`)는 Maven DNS 실패로 의존성 다운로드에서 중단. **우리 모듈은 아직 한 번도 컴파일 안 됨**, 회사 맥에서 확인 필요
- iOS 백그라운드 계속 처리 실기기 확인: 사용자가 "잘된다"고 확인(앱을 나가도 검출 계속)
- **안드로이드 맞춤**(사용자: 기능은 빌드 못 해도 양쪽 같이): (1) 유령 제거를 iOS처럼 샘플 단위 `dropStatic`으로(기존 추적 전체 `isStatic`도 유지), (2) 이어서 돌리기 — `PoseSampler.sample(checkpoint:)`가 30초 분량마다 `cacheDir/detect-checkpoints/<sha256>.json`(org.json)에 추적 상태 저장, 다음 호출에 이어 감, 성공하면 삭제, (3) 백그라운드 계속 처리 — 포그라운드 서비스 `DetectService`(API 35+ `mediaProcessing`, 29~34 `dataSync`), 진행률 알림(1초에 한 번 갱신, 앱 열기), JS 함수 이름은 iOS와 같음(`startBackgroundRun` 등). 모듈 매니페스트에 FOREGROUND_SERVICE 권한 셋과 서비스 선언. 일부러 다르게 둔 값(추적 이어 보기 6초·몸 크기 0.5~2배·프레임 960px)은 그대로. 남은 차이: 들고 찍은 영상 판별
- **백그라운드 계속 처리**(iOS 26+, `BGContinuedProcessingTask`): 영상을 고르면(사용자 동작) `startBackgroundRun`으로 요청 등록(식별자 `com.climbdex.app.detect.<8자>`, Info.plist `BGTaskSchedulerPermittedIdentifiers`에 `com.climbdex.app.detect.*`, app.json `ios.infoPlist`). 작업이 살아 있으면 네이티브가 백그라운드에서도 멈추지 않음(`BackgroundRun.isActive`), 진행률은 0.1초 단위로 프레임마다 보고, 영상마다 부제목 "n/N". 만료·취소되면 기존 이어서 돌리기로 넘어감. 끝나면 `finishBackgroundRun`. 진행률 문구는 작업이 살아 있으면 "앱을 나가도 계속돼요", 아니면 "화면을 켜 두세요"(OS 버전이 아니라 `backgroundRunActive()`로 판단), 화면 꺼짐 방지는 작업이 없을 때만. GPU 자원은 요청 안 함(Vision이 뒤에서 도는지 실기기 확인 필요). 등록은 개별 식별자로 먼저 하고 실패하면 와일드카드로 한 번
- **이어서 돌리기**(iOS 앱만, 스크립트엔 없음): 네이티브가 `didEnterBackground`를 직접 감지(`AppActivity`)하면 처리 중인 묶음을 버리고 추적 상태(트랙·샘플·카메라 이동량·다음 시각)를 `Caches/detect-checkpoints/<uri sha256>.json`에 저장한 뒤 `Interrupted`로 중단. Vision 오류·리더 실패도 같은 처리. 30초 분량마다 중간 저장, 성공하면 파일 삭제. 다음 호출은 저장 시점부터 리더를 열어 이어 감. JS는 `Interrupted`면 앞으로 올 때까지 기다렸다 다시 부름(최대 20번), 처리 시간은 실제 작업 시간만 합산. 다음 단계: Xcode 26 설치 후 `BGContinuedProcessingTask`로 뒤에서도 계속
- **백그라운드 중단 처리**: 검출 중 앱이 뒤로 가면 iOS가 디코더를 끊어 AVAssetReader가 조용히 끝나고, 그때까지 샘플로 구간을 내 "못 찾음"·뒷부분 누락이 생겼음(사용자 보고). 네이티브 `sample()` 끝에서 `reader.status == .failed`면 throw(스크립트·iOS). JS는 영상마다 앱이 앞에 올 때까지 기다렸다 돌리고, 돌리는 동안 한 번이라도 뒤로 갔으면(`lastBackgroundAt`) 결과를 버리고 최대 3번 다시 돎. 안드로이드는 해당 없음(MediaCodec 백그라운드 동작은 미확인)
- **검출 속도는 포기**(exp-01 '속도 실험'): 디코드 축소·포맷·조각 줄이기 모두 측정 노이즈 안이고 결과 경계가 흔들림, 3fps는 품질 저하. 남은 것: 사용자 피드백 따라 트림 화면 다듬기. 따라가기 저장·미리보기가 구간을 다시 자세 인식하는데, 검출 때 얻은 사람 위치를 구간별 경로로 같이 돌려주면 그 단계를 뺄 수 있음(네이티브 detect 반환값 확장, 후보). 완등·실패 분류는 안 함(사용자 결정). 병렬 처리는 이득 없음. "데이터일 때 느림"은 검출이 아니라 iCloud 최적화 저장 때문에 고르기 단계에서 내려받는 것으로 추정, 미확인
- 회사 커밋(`f65ef97`~`468b4d9`) 당긴 뒤 노트북 동기화: `npm install` → expo-doctor가 expo-constants 중복(expo-auth-session 아래 중첩) 경고 → `npm dedupe`로 해결(package-lock.json 바뀜, 미커밋) → app.json에 scheme·secure-store·web-browser 플러그인이 늘어 `npx expo prebuild --clean -p ios` → `npx expo run:ios --device <UDID> --no-bundler`로 iPhone 13 Pro 설치. `--no-bundler`는 Metro를 사용자가 따로 띄울 때 명령이 안 끝나고 매달리는 걸 막음
- `.env`는 gitignore라 기기마다 따로. 노트북엔 `EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_ANON_KEY` 두 줄만 넣음(Google 키는 앱이 안 읽음). **`.env` 없이 띄우면 supabase-js가 모듈 로드 때 `supabaseUrl is required`로 throw해서 앱이 켜지자마자 죽음**. AuthScreen의 "서버 설정이 비어 있어요" 안내는 그 뒤라 실제론 못 뜸. 빈 값일 때 placeholder로 넘기는 두 줄 고칠지 미결
- 함정: `prebuild --clean` 뒤 pod install이 hermes 타르볼(Maven, debug 29MB·release 21MB)을 curl로 받는데 중간에 멈춰 15분 대기. 멈춘 curl을 죽이면 다음 단계로 넘어가고, 빌드 단계 "[Hermes] Replace Hermes" 스크립트가 debug 타르볼 없이도 통과해 release Hermes로 Debug 빌드가 됨(동작엔 지장 없음). 다시 걸리면 타르볼을 따로 받아 `ios/Pods/hermes-engine-artifacts/hermes-ios-0.81.5-debug.tar.gz`에 두면 건너뜀. 아까 디스크 정리로 CocoaPods 캐시를 지운 탓에 전부 새로 받음

## 마지막에 한 일 (2026-10-02, 회사 맥)
- iOS Release 빌드가 Metro 없이 폰에서 켜지는 것 확인(사용자). 안드로이드 테스터 APK 전달해 실기기 테스트 시작
- Google 콘솔 테스트 사용자에 theo@supermembers.co.kr 추가(총 3명). 콘솔 '사용자 추가' 다이얼로그는 저장을 눌러도 안 닫힐 때가 있어 목록 카운트가 바뀌는지 보고 떠날 것
- **안드로이드 하단 탭이 시스템 내비게이션 바와 겹치던 문제 수정**. SDK 54는 안드로이드 edge-to-edge가 기본인데 RN 기본 `SafeAreaView`는 iOS에서만 동작. `react-native-safe-area-context`(~5.6.0) 설치, App을 `SafeAreaProvider`+그쪽 `SafeAreaView`로 감싸고 안드로이드 전용 상태바 paddingTop·탭 paddingBottom 8 임시 처리 제거. 에뮬레이터 Medium_Phone(안드로이드 16)에서 제스처·3버튼 모두 확인. **네이티브 추가라 양쪽 재빌드 필요** — 아이폰 디버그 빌드, 에뮬레이터 디버그 빌드, 테스터 APK(바탕화면, 10-02 09:32) 전부 갱신됨. 미커밋
- **Play 콘솔 내부 테스트 준비**(사용자에게 개발자 계정 있음). 업로드 키스토어 `~/.climbdex/climbdex-upload.keystore`(alias `climbdex`, SHA1 98:2F:D4:A3:…:91:0A), 비밀번호는 `~/.gradle/gradle.properties`의 `CLIMBDEX_UPLOAD_*` 네 항목. `android/app/build.gradle`에 `signingConfigs.release` 추가하고 release 빌드타입이 그걸 쓰게 함. `./gradlew bundleRelease` → `/Users/kimhyunwoo/Desktop/climbdex-1.0.0-1.aab`(112MB, 서명 확인). app.json에 `android.versionCode: 1`. 콘솔 업로드는 사용자가 직접
- 안드로이드 실기기는 USB에서 안 잡힘(맥 USB 트리에 아예 없음, 폰에서 '파일 전송' 선택 불가 → 충전 전용 케이블). 당분간 안드로이드는 에뮬레이터, 실기기는 iOS로만

## 다음에 할 일
- 미커밋 작업물 커밋: `data/grades.json`, `data/gyms.json`, `data/spiri7/`, `docs/research/`, `scripts/spiri7-grades.py`, `scripts/collect-gyms.mjs`, `src/data/gyms.ts`, `src/screens/GymScreen.tsx`, `CLAUDE.md`, `docs/roadmap.md`, `docs/STATUS.md`
- 암장 페이지 종목 표시 폰에서 확인(Metro만 띄우면 됨)
- 띠레벨 표 서버 적용 **완료**(2026-10-06, 사용자가 SQL Editor에서 schema.sql → seed-tapes.sql 실행, gym_tapes 243행 확인. 채팅에서 SQL을 복사하면 터미널 줄바꿈 때문에 글자가 빠지므로 `pbcopy < 파일`로 복사). 다음은 폰에서 암장 페이지 띠 섹션·투표·신고·띠 순서 입력 확인. 신고 확인은 대시보드 `tape_reports` 테이블
- **완등 기록 흐름 폰 확인**: schema.sql 재실행 → 위치 있는 영상(아이폰 카메라로 암장에서 찍은 것)을 골라 클립 저장 → 완등 기록 시트가 뜨는지, 자동 판정이 맞는지, 저장 뒤 `sends` 테이블에 행이 생기는지, 시드 없는 암장이면 띠 순서 알려 주기 버튼이 뜨는지. 위치 없는 영상은 그날 도감 등록 암장으로 잡히는지. 사진 선택기가 iOS에서 위치를 주는지가 미확인(안 주면 createdAt 경로만 동작)
- 완등 판정 정확도: 사용자 영상 몇 개로 자동 판정 결과를 토글 수정 빈도로 확인. 자주 틀리면 exp-02 규칙 수치 조정
- 테스트 끝나면 `SKIP_DISTANCE_CHECK` false로 되돌리고 커밋
- 체크인 배너 실기기 확인: 다음 암장 갈 때 체크인 → 영상 찍고 → 영상 탭 배너 수·추가·사라짐 확인(사용자 결정)
- 새 아이콘 반영 빌드(iOS 홈 화면·잠금 화면 라이브 액티비티 확인)
- Play 콘솔 개발자 계정 인증 완료 → 앱 만들고 내부 테스트 트랙에 AAB 업로드, 테스터 이메일 등록. 테스터는 기존 디버그 키 APK를 지우고 스토어에서 재설치
- 테스터 피드백 받기: 영상 검출 실패 영상은 `/Users/kimhyunwoo/Desktop/클라이밍/`에 모아 exp-01 표에 추가
- 트림 화면 "처음부터" 버튼(시작을 0초로)
- Apple Developer Program 가입 → Apple 로그인 복구, TestFlight
- 같은 날 두 암장 체크인 시 클립 분배, 오프라인 체크인 확인, 첫 실행·권한 거부 안내
- `npm dedupe`(expo-doctor expo-constants 중복 경고, 동작엔 영향 없음)
- 뱃지는 나중에 별도 화면(뱃지 도감)으로. 도감 화면에는 안 넣음
- 안드로이드 실기기 확보 시 검출 속도 측정(detect()에서 people을 cacheDir/detect.csv로 쓰고 `adb shell run-as com.climbdex.app cat cache/detect.csv`), 사진 선택기 중복 방지(파일 크기+길이)
- 들고 찍은 영상 하나 확보해 카메라 이동량 기준값(현재 0.05) 확정
- 검출 로그(`console.log`)와 detect 결과의 `info` 진단 필드 정리
- 출시 준비: 앱 아이콘·이름, 첫 실행 안내, 권한 거부 안내

## 막힌 것 / 함정 (2026-10-02)
- **릴리스 서명은 `android/app/build.gradle`에 직접 넣었고 android/는 gitignore**. `npx expo prebuild --clean` 하면 날아가므로 그 뒤엔 signingConfigs에 release 블록(storeFile file(CLIMBDEX_UPLOAD_STORE_FILE) 등 네 줄)과 `release { signingConfig signingConfigs.release }`를 다시 넣을 것. config plugin으로 자동화하려 했으나 이번 세션 권한 분류기가 파일 생성을 막음
- **Play 업로드마다 versionCode 증가 필요**. app.json `android.versionCode`가 원본이지만 android/에 반영되는 건 prebuild 때뿐이라 prebuild 없이 빌드하면 `android/app/build.gradle`의 versionCode도 손으로 같이 올릴 것
- 키스토어는 레포 밖 `~/.climbdex/`에만 있음. **다른 기기에서 AAB를 만들려면 키스토어 파일과 `~/.gradle/gradle.properties`의 CLIMBDEX_UPLOAD_* 네 줄을 옮겨야 함.** 잃어버리면 Play App Signing의 업로드 키 재설정 절차 필요
- 바탕화면 APK(10-02 09:32)는 아직 디버그 키 서명. 이후 `assembleRelease`로 만드는 APK는 업로드 키 서명이라 디버그 키 APK 위에 덮어쓰기 설치가 안 됨(지우고 설치)
- **node_modules 재설치 뒤엔 Metro도 다시 띄울 것**. 전날 켜 둔 Metro가 재설치로 지워졌다 다시 생긴 `@expo/vector-icons` 폰트를 못 찾아 "Unable to resolve ./vendor/react-native-vector-icons/Fonts/AntDesign.ttf"로 번들 실패. 파일은 있고 Metro 파일 감시가 낡은 것. 재시작으로 해결
- **`expo run:ios --device`가 "Connecting to: 혀누"에서 멈춤**(Release·Debug 모두, 폰 잠금 안 풀려 있어도). 컴파일은 끝난 상태라 `xcrun devicectl device install app --device 00008110-0011056C1428401E <DerivedData>/Build/Products/<Debug|Release>-iphoneos/climbdex.app` 후 `xcrun devicectl device process launch --device … com.climbdex.app`으로 직접 설치·실행
- 폰이 Metro 서버 목록에서 맥을 못 찾으면 `--payload-url "exp+climbdex://expo-development-client/?url=http%3A%2F%2F192.168.50.64%3A8081"`로 주소를 직접 넘김. 이번엔 이걸로 바로 붙음
- **에뮬레이터 스냅샷 복원 뒤 adb가 offline으로 영영 안 돌아옴**(Medium_Phone 12분 대기). `-no-snapshot-load`로 콜드 부팅하면 21초. 에뮬레이터는 `~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.0 -no-snapshot-load`, adb는 `~/Library/Android/sdk/platform-tools/adb`(PATH에 없음)
- 에뮬레이터 내비게이션 모드 바꾸기: `adb shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.threebutton` 뒤 SystemUI 재시작(`adb shell am crash com.android.systemui`) 해야 적용. 재시작 없이는 버튼이 안 그려지고 인셋도 그대로
- 에뮬레이터 둘: Pixel_7(안드로이드 14), Medium_Phone_API_36.0(안드로이드 16). edge-to-edge 확인은 16으로

## 회사 맥에서 한 일 (2026-09-30)
- 노트북 커밋을 당긴 뒤 `npm install`·`pod install`·양쪽 재빌드. iPhone 13 Pro와 에뮬레이터 Pixel_7 둘 다 최신 코드로 올라감
- **도감 탭을 셋으로 분리**(JS만, 재빌드 불필요). 홈 `DexScreen`: 체크인 배너 + 내 암장 격자(방문한 곳만, 최근 방문순) + 아래 "오늘 어디 갈까요?" 묶음("오랜만에 가 볼까요?" = 가 본 암장 중 7일 이상 안 간 곳 오래된 순 전부, "근처 새 암장 가 볼까요?" = 안 가 본 곳 거리순 5곳, 위치 권한 있을 때만). 모은 게 없으면 격자는 빈 채로. `AllGymsScreen`: 예전 홈이던 지역 카드→구별 격자·검색을 그대로 옮김. `HistoryScreen`: 월 캘린더(방문일에 지역색 점, 날짜 누르면 그날 암장)만. 추천을 기록 화면에 뒀다가 홈으로 되돌림(결정 순간에 여는 화면이 홈, 캘린더는 날짜 축이라 안 맞음, 빈 홈에 누를 곳이 생김). App에 `dexView` 상태, 도감 탭을 다시 누르면 홈으로
- 진행 바·암장 카드·암장 줄은 두 화면 이상에서 쓰여 `src/components/dex.tsx`로 뺌(`Progress`·`GymCard`·`GymRow`·`formatAgo`). `src/store/dex.ts`에 `lastVisits`
- **새 기능 결정: 시도 분석(동작 코칭)**. 사용자가 원한 "사지별 힘 %·완등 확률 오르는 다음 홀드"는 영상에 없는 정보라 빼고, 측정→루트 인식→완등 시도 비교→코칭 문장 4층으로 재설계. 첫 버전은 기술 코칭까지, 학습 없음, 삼각대·정적부터. 설계·규칙 표·통과 기준은 `docs/exp-02-move-analysis.md`, 결정은 roadmap 4번. 실험 도구 `scripts/joints.swift`(관절 15개 CSV 덤프, 1.MOV 13~20초 70프레임 2초에 확인) 준비됨. **사용자가 완등·낙하 영상을 주면 1층 실험 시작**
- **시도 분석 기능 폐기**(2026-10-01, 사용자 결정). 하루 동안 관절 덤프 네이티브(iOS·Android), JS 무브·낙하 판정, 루트 홀드 색 검출(iOS 네이티브), 분석 탭·분석 화면(스켈레톤·유령 자세·지지 다각형·부하 %·등반 전체 띠·낙하 직전 제안 점선)까지 만들어 폰에서 봤으나 "유용하게 쓰진 못할 것 같다"로 결론. 근본 이유: 폰 2D 영상의 관절·색 정보로는 클라이머가 이미 눈으로 아는 것 이상을 못 주고, "다음엔 어떤 무브"는 같은 루트의 완등 데이터 없이는 규칙 추측에 그침. 앱 코드는 `d2f3041` 커밋을 되돌려 제거(working tree, 미커밋), 미커밋 후속 작업은 `git stash list`의 "analysis-wip"에 보관. 남긴 것: `docs/exp-02-move-analysis.md`(실험 기록·결론), `scripts/joints.swift`·`analyze-joints.py`·`frame.swift`·`holds-color.py`(맥 실험 도구). **네이티브가 바뀌어 양쪽 재빌드 필요**
- **로그인 + 서버 도감 착수**(사용자 결정: 영상은 로그인 없이, 도감처럼 사용자별 분리가 필요한 기능은 로그인 필수). Supabase. `supabase/schema.sql`(visits·gym_photos 테이블, 본인 행만 RLS, storage 버킷 gym-photos를 `<user_id>/…` 경로로 본인만, `delete_my_account()` RPC). 앱: `src/lib/supabase.ts`(세션은 SecureStore), `src/auth/auth.ts`(Apple은 네이티브 → signInWithIdToken, Google은 Supabase OAuth URL을 WebBrowser로 열고 `climbdex://auth`로 돌아온 토큰을 setSession), `AuthScreen`(도감 탭 게이트), `src/store/dex.ts`는 사용자별 캐시(`dex-<uid>.json`)로, `src/store/remote.ts`가 서버 읽기·쓰기(사진은 720px JPEG 업로드, 내려받기는 서명 URL). 쓰기는 낙관적 반영 + `pending` 큐, 다음 실행 때 재시도. 첫 로그인 때 로그인 전 기록(`dex.json`)이 있으면 올릴지 묻고 이관. 도감 홈 헤더 "계정" → 로그아웃·회원 탈퇴. `Visit`에 `id`(uuid) 추가, 삭제는 id 기준. app.json에 `scheme: climbdex`, `usesAppleSignIn`, expo-apple-authentication·secure-store·web-browser 플러그인 → **prebuild --clean + 양쪽 재빌드 필요**
- **서버 설정 완료(2026-10-01)**. Supabase 프로젝트 `kdymnbrxebukgerturql`(사용자가 대시보드에서 생성, 스키마 SQL Editor로 적용, RLS·버킷 `gym-photos`·탈퇴 RPC 확인). Google Cloud 프로젝트 `climbdex`(계정 khwland090@gmail.com, Playwright로 생성): OAuth 동의 화면 외부·테스트 중, 테스트 사용자 khwland090@gmail.com·hyunw00theo@gmail.com, 웹 OAuth 클라이언트 "climbdex supabase"(리디렉션 `https://kdymnbrxebukgerturql.supabase.co/auth/v1/callback`). Supabase Google 제공자 켜짐(`/auth/v1/settings`에서 확인), Redirect URLs에 `climbdex://auth`. 키는 `.env`(`EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_ANON_KEY`·`GOOGLE_OAUTH_CLIENT_ID/SECRET`). **동의 화면이 '테스트 중'이라 테스트 사용자 두 계정만 로그인 가능**, 출시 전 '앱 게시'(브랜딩 페이지 구성 완료 필요) 또는 테스트 사용자 추가. Google Cloud 무료 프로젝트 할당량이 이걸로 소진됨
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
- **저장은 항상 9:16**(사용자 결정, 인스타 릴스 기준. 피드 격자는 가운데 4:5로 잘려 보임): 따라가기 끄면 가운데 고정 9:16 크롭(`exportCrop`, 1080×1920 H.264, 오디오 유지), 켜면 기존 따라가기. 미리보기도 `cropPlan`(프레임·크롭·고정 위치)으로 잘린 화면을 보여줌. 원본 비율 저장(`trim`)은 안 씀. iOS `exportFollow(fixed:)`로 합침, 안드로이드는 `FollowPath`에 중앙 샘플 하나·몸통 1.0으로 같은 효과(미빌드). 트림 화면 헤더(← 목록 · ‹ n/N ›)는 스크롤 밖 고정
- **자르기 설정**(사용자 제안): 영상 목록 톱니 → `SettingsScreen`(모달). 시작 여유(기본 3초)·끝 여유(기본 2초) 0~10초 스텝퍼, 점선 구간 포함 토글. `src/settings.ts`에 `settings.json`으로 저장, `clipsOf(video, settings)`가 여유를 붙임. 손 안 댄 영상은 즉시, 편집한 영상은 "처음으로" 때 반영. 검출 내부값(12%·8초·반경)은 노출 안 함(사용자 동의)
- **타임라인 확대**(사용자 피드백: 긴 영상에서 핸들이 너무 좁음): 칩을 누르면 타임라인이 그 구간 ± 여유(길이의 25%, 최소 3초)로 확대되고 썸네일도 그 범위로 다시 뽑음. 들어갈 때도 첫 구간으로 확대(구간이 둘 이상일 때). 상태 줄의 "전체 보기"/"구간 확대"로 전환. `Timeline`에 `viewStart`/`viewEnd`, 범위 밖 핸들·플레이헤드는 숨김
- 트림 화면 정리(사용자 피드백): 재생·저장 버튼을 스크롤 밖 하단 고정 바로("N번 저장" + "모든 구간 저장" 링크), 구간 칩은 가로 스크롤 한 줄, 칩 누르면 그 시작점으로 가서 바로 재생, 저장한 칩에 ✓. 영상 미리보기 최대 높이 560→460. 저장 중 스크롤 잠금 제거
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

## 기능 후보 (2026-10-01 논의)
- **초반 유입용 둘로 좁힘**(사용자 결정, 친구 도감은 "남의 도감은 안 궁금하다"로 기각): (1) 체크인 순간 공유 이미지 — 구현함. `src/components/ShareCard.tsx`(9:16, 360×640을 1080×1920으로 캡처: 브랜드·#번호·사진/실루엣·암장명·지역·"내 N번째 암장"·날짜·N/529), `src/share.ts`(react-native-view-shot `captureRef` → expo-sharing 공유 시트). 등록 연출(`Celebration`)에 "스토리로 공유" 버튼, 암장 페이지 링크 줄에 "도감 카드 공유". N번째는 그 암장을 처음 간 시점 기준 distinct 암장 수. **네이티브 둘 추가라 양쪽 재빌드 필요**. (2) 로그인 전 둘러보기 — 10/04 구현
- 도감 다음 작업(사용자 결정): 홀드 실루엣을 실제 홀드 이미지로 교체(사용자가 이미지 생성 → `assets/holds/*.png`, `Silhouette`가 Image tintColor로 지역색 물들임), 같은 날 두 암장 체크인 시 클립 분배(촬영 시각과 가까운 체크인 쪽), 오프라인 체크인 동작 확인, 첫 실행·권한 거부·로그인 전 도감 설명. 공유 카드·뱃지·지도·친구 도감 등은 사용자 생긴 뒤
- 영상: 완등·낙하 자동 분류(exp-02에서 세 영상 모두 맞음, 하강 직전 최고점 1.5초 정지 규칙)를 목록·트림에 붙여 "완등만 저장"·완등 수 표시. 분석 기능에서 유일하게 검증된 조각
- 데이터 백업·복원(iCloud/Google Drive 또는 파일 내보내기). 도감이 폰에만 있어 앱 삭제 시 소실. 출시 전 필요
- 출시 준비(아이콘·첫 실행 안내·권한 거부 안내·로그 정리)
- (10-05 논의, 보류) 원본 정리: 클립 저장한 원본을 목록 위 한 줄로 모아 시스템 삭제(iOS `deleteAssets`, 안드로이드 `createDeleteRequest`). 사용자: 지금 당장 필요 없음

## 테스터 배포 (2026-10-01)
- 안드로이드 릴리스 APK: `cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`(145MB, ABI 4종 + dev-menu 포함). 처음엔 릴리스용 네이티브 아티팩트 ~100MB를 내려받아 16분, 이후는 빠름. JS와 `.env`의 EXPO_PUBLIC 값이 번들에 들어가 Metro 없이 동작. **디버그 키로 서명됨**(Expo 템플릿 기본). 같은 맥의 `~/.android/debug.keystore`로 계속 빌드해야 덮어쓰기 설치가 되고, 플레이스토어 전엔 릴리스 키를 만들어 바꿔야 함(그때 테스터는 재설치). 테스터에겐 파일을 카톡·드라이브로 전달
- iOS 테스터 배포는 TestFlight뿐 → Apple Developer Program 가입 필요(Apple 로그인도 같이 풀림)
- Google 로그인은 동의 화면이 '테스트 중'이라 테스트 사용자(현재 khwland090·hyunw00theo)만 가능. 테스터가 늘면 Google 콘솔에서 추가하거나 '앱 게시'

## 막힌 것 / 함정
- **prebuild 하면 푸시 권한이 다시 들어감**: expo-notifications 플러그인이 `ios/climbdex/climbdex.entitlements`에 `aps-environment`를 넣는데, 무료 개인 팀은 푸시를 못 써서 "does not support the Push Notifications capability"로 서명 실패. 로컬 알림만 쓰므로 prebuild 뒤 `/usr/libexec/PlistBuddy -c "Delete :aps-environment" ios/climbdex/climbdex.entitlements`. 매번 하기 싫으면 이걸 지우는 작은 config plugin 필요(미적용)
- **릴리스 APK가 켜자마자 죽음(2026-10-01)**: `NoSuchMethodError ReturnTypeKt.getDirectConverter` in `expo.modules.font.FontLoaderModule`. `@expo/vector-icons` 설치 때 중첩으로 딸려 온 `expo-font@57`이 autolinking에 잡혀 SDK 54의 expo-modules-core 3.0과 불일치. 해결: `npx expo install expo-font`로 14.0.12 고정 + node_modules 재설치. 새 패키지 넣은 뒤엔 `npx expo-doctor`를 한 번 돌릴 것. 릴리스 크래시는 에뮬레이터에 APK 설치 후 `adb logcat | grep -E "FATAL|AndroidRuntime"`로 확인
- **Sign in with Apple은 무료 개인 팀에서 안 됨.** "Personal development teams do not support the Sign in with Apple capability"로 프로파일 생성 실패. 패키지가 설치돼 있기만 해도 prebuild가 플러그인을 자동 적용해 entitlement를 넣으므로 `expo-apple-authentication`을 **제거**하고 Apple 로그인 코드도 뺌(커밋 이력의 `signInWithApple`: expo-crypto로 nonce 만들어 `signInAsync` → `supabase.auth.signInWithIdToken({provider:'apple', token, nonce})`). 유료 가입 후: `npx expo install expo-apple-authentication`, app.json `ios.usesAppleSignIn: true`, AuthScreen에 Apple 버튼, prebuild --clean. 앱스토어 심사는 소셜 로그인이 있으면 Apple 로그인도 요구하므로 출시 전 필수
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
