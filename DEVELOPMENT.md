# Development

## 로컬 세팅

```bash
npm install
```

## 검증 - 테스트

```bash
npm run check
```

## 로컬 실행

로컬에서는 아직 GitHub raw URL에 올라가지 않은 `redirects.json`을 바로 쓰기 위해
`CONFIG_JSON`으로 설정을 넘긴다.

```bash
CONFIG_JSON="$(cat redirects.json)" npm run dev
```

## 배포 dry-run

```bash
HOME=/tmp npx wrangler deploy --dry-run
```

## redirect 추가

1. `redirects.json`에 항목을 추가한다.
2. 공개 URL은 `/<repo>/<file>` 또는 `/@<owner>/<repo>/<file>` 형태로 유지한다.
3. repo 내부 실제 파일 위치는 `path`에 적는다.
4. 기본 설치가 최신 릴리스 기준이어야 하면 `ref`를 `latest`로 둔다.
5. `npm run check`를 실행한다.
6. 변경사항을 커밋한다.

예시:

```json
{
  "repo": "example-app",
  "file": "install.sh",
  "ref": "latest",
  "path": "install/install.sh"
}
```

## 동작 정책

- Worker는 등록된 `(owner, repo, file)` 조합만 redirect한다.
- 요청자가 query parameter로 redirect 대상 URL을 바꿀 수 없다.
- `tag` query만 명시 버전 선택에 사용한다.
- `?tag=vX.Y.Z` 또는 `?tag=vX.Y.Z-prerelease` 형태만 허용한다.
- `ref: "latest"`는 GitHub latest release tag를 조회한 뒤 그 tag 기준 파일로 redirect한다.

## 배포

`main`에 push하면 GitHub Actions가 Cloudflare Worker를 배포한다.

필요한 GitHub Secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`redirects.json`만 바뀐 경우에는 Worker 코드 배포 없이 런타임 설정 fetch로 반영된다.
