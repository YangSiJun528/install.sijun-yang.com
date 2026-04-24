# Development

## 로컬 세팅

```bash
npm install
```

## 검증

```bash
npm run check
```

`npm run check`는 `redirects.json` 검증과 Worker 라우터 테스트를 함께 실행한다.

## 로컬 실행

Worker는 `redirects.json`을 배포 번들에 포함해서 사용한다.

```bash
npm run dev
```

## 배포 dry-run

```bash
HOME=/tmp npx wrangler deploy --dry-run
```

## redirect 추가

1. `redirects.json`의 `files` 배열에 항목을 추가한다.
2. `file`은 공개 URL의 파일명이며 GitHub Releases asset 이름이기도 하다.
3. `repo`는 GitHub repository 이름이다.
4. `ref`가 없으면 `latest`로 간주한다. `ref`는 `latest` 또는 `vX.Y.Z` 형식의 release tag만 허용한다.
5. `npm run check`를 실행한다.
6. `main`에 push해서 Worker를 다시 배포한다.

예시:

```json
{
  "repo": "jungle-bell",
  "file": "jungle-bell.sh",
  "ref": "latest"
}
```

## 동작 정책

- Worker는 `redirects.json`에 등록된 `file`만 `/<file>` 형태로 redirect한다.
- `tag` query만 명시 버전 선택에 사용한다.
- `?tag=vX.Y.Z` 또는 prerelease tag만 허용한다.
- `tag`가 없거나 `tag=latest`이면 GitHub의 `/releases/latest/download/<file>`로 redirect한다.
- 명시 tag는 `/releases/download/<tag>/<file>`로 redirect한다.
- GitHub API 호출, latest tag resolve, Worker-side cache는 사용하지 않는다.
- `/`는 프로젝트 링크와 사용 가능한 경로를 보여준다.
- `/healthz`는 번들된 설정이 유효하면 `ok`를 반환한다.

## 배포

`main`에 push하면 GitHub Actions가 Cloudflare Worker를 배포한다.

필요한 GitHub Secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`redirects.json`은 Worker 배포 번들에 포함되므로, 설정 변경도 `main` push 이후 배포되어야 반영된다.
