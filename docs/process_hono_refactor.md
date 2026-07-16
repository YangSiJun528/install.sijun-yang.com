# Hono 리팩터링 변경 문서

상태: 구현 완료

## 목적

Cloudflare Worker를 Hono 기반으로 단순화하고, 공개 경로와 목적지 URL을 `redirects.json`만 수정해서 확장할 수 있게 한다. GitHub Releases 전용 로직이나 목적지 도메인 검사는 두지 않는다.

## 최종 데이터 계약

단순 리다이렉트는 공개 경로와 목적지 URL 문자열만 선언한다.

```json
{
  "/foo/latest": "https://bar.example/releases/latest/foo.sh",
  "/foo/{version}": "https://bar.example/releases/{version}/foo.sh"
}
```

쿼리 파라미터와 기본값이 필요할 때만 객체 형식을 사용한다.

```json
{
  "/foo/{version}": {
    "url": "https://bar.example/{version}/foo-{os}-{arch}.tar.gz",
    "defaults": {
      "os": "linux",
      "arch": "amd64"
    }
  }
}
```

## 해석 규칙

1. JSON key의 `{name}`을 경로 파라미터로 해석한다.
2. 목적지 URL의 placeholder 중 경로에서 채워지지 않은 이름을 허용된 쿼리 파라미터로 해석한다.
3. 쿼리가 생략되면 `defaults`를 사용한다.
4. 모든 값을 URL 인코딩한 뒤 같은 이름의 placeholder 전체에 삽입한다.
5. 값이 없는 placeholder, 허용되지 않은 쿼리 또는 중복 쿼리는 `400`을 반환한다.
6. 등록되지 않은 경로는 `404`를 반환한다.
7. 정적 경로를 동적 경로보다 먼저 등록한다.
8. placeholder 문법, 기본값 이름과 중복 경로 검증은 CI 테스트에서 수행한다.

경로 placeholder는 모호한 부분 매칭을 피하기 위해 전체 경로 구간 하나를 차지해야 한다.

## HTTP 동작

| 요청 | 결과 |
| --- | --- |
| `GET /` | GitHub 저장소로 `302` 이동 |
| `GET /info` | 시스템 경로와 현재 리다이렉트 설정을 JSON으로 반환 |
| `GET /jungle-bell.sh/latest` | 최신 릴리스 파일로 `302` 이동 |
| `GET /jungle-bell.sh/v0.3.6` | 해당 태그의 릴리스 파일로 `302` 이동 |
| `GET /healthz` | `200 ok` 반환 |
| 누락·미등록·중복 쿼리 | `400 Bad Request` 반환 |
| 미등록 경로 | `404` 반환 |
| `HEAD` | GET과 같은 상태 및 헤더를 본문 없이 반환 |

성공한 리다이렉트와 상태 확인 응답에는 `Cache-Control: no-store`를 설정한다.

## 변경 파일

- `worker.js`: Hono 앱, 설정 컴파일, 경로 및 쿼리 해석
- `redirects.json`: 루트, 최신 버전, 명시 버전 리다이렉트
- `worker.test.js`: 라우팅, 정보 API, 기본값과 오류 단위 테스트
- `config.test.js`: CI의 `redirects.json` 설정 계약 검증
- `package.json`, `package-lock.json`: Hono와 `url-template` 런타임 의존성
- `README.md`: 공개 URL 사용법
- `DEVELOPMENT.md`: 설정 추가와 배포 절차
- `validate-config.mjs`: 별도 검증 스크립트를 제거하고 Worker 설정 컴파일 단계로 통합

## 검증 기준

- 정적 `latest` 경로가 동적 `{version}` 경로보다 우선한다.
- 경로와 쿼리 값이 URL 인코딩되어 치환된다.
- 목적지 URL은 `url-template`로 한 번 파싱한 뒤 요청 값으로 확장한다.
- 기본값 적용과 쿼리 재정의가 동작한다.
- 기본값 없는 필수값과 잘못된 파라미터는 `400`이다.
- 잘못된 설정은 `npm run check`에서 실패한다.
- `npm run check`와 Wrangler dry-run이 성공한다.
