# STATUS

## 마지막에 한 일 (2026-09-28, 회사 맥)
- Expo SDK 54(RN 0.81) 프로젝트 생성. SDK 55 이상은 Xcode 26 필요, 이 맥은 Xcode 16.2라 54로 고정
- 로컬 Swift 모듈 `modules/climb-video`: `trim(uri, start, end)` → 임시 .mov 경로 반환(재인코딩 없는 passthrough)
- 화면 2개: 영상 여러 개 고르기·목록(`src/screens/VideoListScreen.tsx`), 시작·끝 슬라이더 트림·구간 재생·사진 앱 저장(`src/screens/TrimScreen.tsx`)
- iPhone 16 Pro(iOS 18.5, UDID 4CDE03EA-C628-400B-9384-0862C9DC373A) 시뮬레이터 빌드 성공·앱 설치됨. Metro는 아직 안 띄움. 시뮬레이터 사진 앱에 테스트 영상 1개 들어 있음

## 다음에 할 일
- `npx expo start` 띄우고 시뮬레이터 앱 열어 고르기 → 트림 → 저장 흐름 확인
- 자동 검출(사람 상자 높이 변화로 시도 구간 찾기)을 Swift 모듈에 `detect(uri)`로 추가, 테오 등반 영상으로 실험

## 막힌 것 / 함정
- 로컬 모듈 설정은 `platforms: ["ios"]` + `ios` 키 형식. `apple`로 쓰면 SDK 54에서 "doesn't support iOS platform"으로 조용히 빠짐
- 모듈 podspec 배포 타깃은 Podfile 기본값 15.1 이하여야 링크됨
- `xcrun simctl addmedia`는 한글 경로 파일을 PHPhotosErrorDomain -1로 거부. ASCII 경로로 복사한 뒤 넣을 것
- CocoaPods는 homebrew `pod`(1.16.2) 사용
