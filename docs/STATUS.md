# STATUS

## 마지막에 한 일 (2026-09-28, 회사 맥)
- 개인 레포 `Hyuunw00/climbdex`(비공개) 만들고 첫 커밋 푸시. 이 폴더 git 작성자는 개인 계정, 푸시용 credential.helper는 로컬 설정에 있음
- 검출 실험 시작. `scripts/detect.swift`(macOS 스크립트)로 1.MOV 돌려 11.6~48.2초 검출. 눈대중 정답 ~11/~48초. 상세는 `docs/exp-01-video-cut.md`
- 같은 로직을 Swift 모듈 `detect(uri)`로 이식. 트림 화면이 열리면 검출을 돌려 첫 구간으로 슬라이더를 미리 잡고, 구간이 여러 개면 칩으로 고름. 슬라이더를 먼저 만졌으면 덮어쓰지 않음
- 시뮬레이터 사진 앱에 1.MOV 넣어 둠 (Desktop/클라이밍/1.MOV 원본)

## 다음에 할 일
- 시뮬레이터에서는 검출이 안 되므로(아래 막힌 것) 트림 → 저장 흐름만 확인. 검출은 실기기에서
- 1.MOV 정답 시작·끝 시각을 사용자에게 받아 실험 표 채우기
- 실기기로 폰 안의 영상 여러 개 돌려 10개 채우기. 개발 인증서 재발급 필요(아래)
- 시작 전 대기 구간이 긴 영상, 타인 지나가는 영상에서 기준선·오검출 확인

## 막힌 것 / 함정
- 실기기(iPhone 13 Pro, iOS 26.6.2) 빌드는 **Xcode 16.2로 됨**(8/12 회사 앱을 같은 폰에 올린 기록 있음). Xcode 26·macOS 업데이트 불필요. 막힌 건 개발용 서명 인증서 하나: "Apple Development: 현우 김"이 2026-08-29 만료됨. `expo run:ios --device`가 "No code signing certificates are available"로 실패. Xcode → Settings → Accounts → 계정 선택 → Manage Certificates → + → Apple Development로 재발급 후, 개인 Apple ID 팀이면 `app.json`의 `ios.appleTeamId`에 팀 ID 넣기. 기기 UDID는 devicectl의 UUID가 아니라 `00008110-0011056C1428401E`
- Vision 사람 상자 검출은 벽에 붙은 자세를 못 잡음. 관절 추정(발목)을 쓸 것
- **시뮬레이터에서 관절 추정이 안 됨**. 런타임(17.5·18.3·18.5 전부)에 `cnn_human_pose.espresso.weights`가 빠져 있어 `VNDetectHumanBodyPoseRequest`가 "Unable to setup request"로 실패, 앱에선 "검출 실패" 알림. 검출 확인은 실기기 또는 `scripts/detect.swift`(맥)로만 가능
- 로컬 모듈 설정은 `platforms: ["ios"]` + `ios` 키 형식. `apple`로 쓰면 SDK 54에서 "doesn't support iOS platform"으로 조용히 빠짐
- 모듈 podspec 배포 타깃은 Podfile 기본값 15.1 이하여야 링크됨
- `xcrun simctl addmedia`는 한글 경로 파일을 PHPhotosErrorDomain -1로 거부. ASCII 경로로 복사한 뒤 넣을 것
- CocoaPods는 homebrew `pod`(1.16.2) 사용
- gh 기본 credential helper는 비활성 계정 토큰을 안 줌. 개인 노트북에서 clone하면 `git config credential.helper '!f() { echo username=Hyuunw00; echo "password=$(gh auth token --user Hyuunw00)"; }; f'` 필요
