# 모바일 앱 (Flutter)

Firebase Firestore와 연동되는 모바일 앱입니다.

## 사전 요구사항

- [Flutter SDK](https://docs.flutter.dev/get-started/install) 설치

## 프로젝트 생성 (최초 1회)

Flutter가 설치되어 있으면 app 폴더가 비어있을 수 있습니다. 기존 플랫폼 파일이 없다면:

```bash
cd app
flutter create . --org com.firebasetest
```

## 실행

```bash
cd app
flutter pub get
flutter run
```

## Firebase 연동

1. `flutterfire configure` 실행 (Firebase CLI + FlutterFire 필요)
2. 또는 `google-services.json` (Android), `GoogleService-Info.plist` (iOS) 수동 추가
