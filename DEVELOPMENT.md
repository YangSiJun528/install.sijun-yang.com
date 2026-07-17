# Development

## 로컬 실행

```bash
npm install
npm run dev
```

## `redirects.json` 설정

JSON key는 공개 경로이고 value는 목적지 URL입니다. 목적지 URL은 RFC 6570 URI Template을 기반으로 작성합니다. 목적지 도메인과 프로토콜은 제한하지 않으므로 안전한 URL만 등록해야 합니다.

| 표현식 | 동작 |
| --- | --- |
| `{name}` | 값을 URL에 삽입합니다. 경로값이나 기본값이 없으면 같은 이름의 요청 쿼리 파라미터가 필요합니다. |
| `{?name}` | 값이 있을 때 새 쿼리를 `?name=value` 형식으로 추가합니다. |
| `{&name}` | 값이 있을 때 기존 쿼리 뒤에 `&name=value` 형식으로 추가합니다. |

### 정적 경로

파라미터가 필요 없는 리다이렉트는 URL 문자열만 지정합니다.

```json
{
  "/foo/latest": "https://bar.example/latest/foo.sh"
}
```

```text
/foo/latest
→ https://bar.example/latest/foo.sh
```

### 필수 경로 파라미터

경로의 `{name}`은 전체 경로 구간 하나를 받으며, 목적지 URL의 같은 placeholder에 삽입됩니다.

```json
{
  "/foo/{version}": "https://bar.example/releases/{version}/foo.tar.gz"
}
```

```text
/foo/v1.0.0
→ https://bar.example/releases/v1.0.0/foo.tar.gz
```

경로 파라미터는 선택값으로 만들지 않습니다. 기본 경로가 필요하면 정적 key를 추가합니다. 정적 경로는 동적 경로보다 먼저 매칭됩니다.

```json
{
  "/foo/latest": "https://bar.example/releases/latest/foo.tar.gz",
  "/foo/{version}": "https://bar.example/releases/{version}/foo.tar.gz"
}
```

### 기본값 없는 필수 쿼리 파라미터

목적지 URL에만 존재하는 placeholder는 같은 이름의 쿼리 파라미터로 받습니다. `defaults`가 없으면 필수입니다.

```json
{
  "/foo/{version}": "https://bar.example/releases/{version}/foo-{os}-{arch}.tar.gz"
}
```

```text
/foo/v1.0.0?os=linux&arch=amd64
→ https://bar.example/releases/v1.0.0/foo-linux-amd64.tar.gz

/foo/v1.0.0?os=linux
→ 400 Bad Request
```

### 기본값이 있는 선택 쿼리 파라미터

`defaults`가 있는 쿼리 파라미터는 생략할 수 있습니다. 요청값이 기본값보다 우선합니다.

```json
{
  "/foo/{version}": {
    "url": "https://bar.example/releases/{version}/foo-{os}-{arch}.tar.gz",
    "defaults": {
      "os": "linux",
      "arch": "amd64"
    }
  }
}
```

```text
/foo/v1.0.0
→ https://bar.example/releases/v1.0.0/foo-linux-amd64.tar.gz

/foo/v1.0.0?arch=arm64
→ https://bar.example/releases/v1.0.0/foo-linux-arm64.tar.gz
```

같은 URL에서 일부만 선택값으로 만들 수도 있습니다.

```json
{
  "/foo/{version}": {
    "url": "https://bar.example/releases/{version}/foo-{os}-{arch}.tar.gz",
    "defaults": {
      "os": "linux"
    }
  }
}
```

이 경우 `os`는 선택값이고 `arch`는 필수 쿼리 파라미터입니다.

### 선택 쿼리 파라미터

목적지 쿼리 파라미터 자체를 선택적으로 구성하려면 `{?name}`을 사용합니다. 요청과 `defaults`에 모두 값이 없으면 표현식 전체가 생략됩니다. 요청값이 `defaults`보다 우선합니다.

`{?name}`이 `?`를 생성하므로 URL에 `?`를 따로 추가하지 않습니다.

```json
{
  "/foo": "https://bar.example/download{?arch}"
}
```

```text
/foo
→ https://bar.example/download

/foo?arch=arm64
→ https://bar.example/download?arch=arm64
```

목적지 URL에 쿼리 파라미터가 이미 있으면 `{&name}`을 사용합니다.

```json
{
  "/foo": "https://bar.example/download?raw=1{&arch}"
}
```

```text
/foo
→ https://bar.example/download?raw=1

/foo?arch=arm64
→ https://bar.example/download?raw=1&arch=arm64
```

여러 선택 파라미터는 `{?os,arch}` 또는 `{&os,arch}`처럼 쉼표로 나열합니다. RFC 6570 확장 규칙에 따라 값이 없는 파라미터는 생략되고, 쿼리 구분자와 URL 인코딩이 적용됩니다.

### 오류 규칙

- 필요한 placeholder 값이 없으면 `400`입니다.
- 목적지 URL에 없는 쿼리 파라미터는 `400`입니다.
- 같은 쿼리 파라미터를 중복해서 보내면 `400`입니다.
- 등록되지 않은 경로는 `404`입니다.
- 잘못된 placeholder, 기본값 이름 또는 중복 경로는 CI 설정 검증에서 실패합니다.
- `/healthz`와 `/info`는 시스템 경로이므로 `redirects.json`에 등록할 수 없습니다.

## 검증

```bash
npm test
npm run test:config
npm run check
HOME=/tmp npx wrangler deploy --dry-run
```

- `npm test`: Worker 단위 테스트
- `npm run test:config`: `redirects.json` 설정 계약 검사
- `npm run check`: CI에서 설정 검사와 단위 테스트를 모두 실행

## 배포

Cloudflare의 빌드 단계가 `npm run check`를 실행하고, 검증을 통과한 `main` 변경을 배포합니다. `redirects.json`도 Worker 번들에 포함되므로 설정 변경에는 새 배포가 필요합니다.
