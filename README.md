# install.sijun-yang.com

Jungle Bell 설치 스크립트용 짧은 주소를 제공하는 Cloudflare Worker입니다.

프로젝트: https://github.com/YangSiJun528/jungle-bell

## 사용 방법

최신 버전 설치:

```bash
curl -fsSL https://install.sijun-yang.com/jungle-bell.sh | sh
```

```powershell
irm https://install.sijun-yang.com/jungle-bell.ps1 | iex
```

특정 태그 설치:

```bash
curl -fsSL "https://install.sijun-yang.com/jungle-bell.sh?tag=vX.Y.Z" | sh
```

```powershell
irm "https://install.sijun-yang.com/jungle-bell.ps1?tag=vX.Y.Z" | iex
```

지원되는 주소:

```text
https://install.sijun-yang.com/
https://install.sijun-yang.com/healthz
https://install.sijun-yang.com/jungle-bell.sh
https://install.sijun-yang.com/jungle-bell.ps1
https://install.sijun-yang.com/jungle-bell.sh?tag=vX.Y.Z
https://install.sijun-yang.com/jungle-bell.ps1?tag=vX.Y.Z
```

`tag`가 없거나 `tag=latest`이면 GitHub Releases의 latest asset으로 이동합니다. 명시 태그는 `v1.2.3` 또는 prerelease semver tag만 허용합니다.

## 설정

공개 라우트는 `redirects.json`의 `files` 목록으로 관리합니다. 각 항목의 `file` 값이 공개 경로와 GitHub Releases asset 이름으로 사용됩니다.

```json
{
  "repo": "jungle-bell",
  "file": "jungle-bell.sh",
  "ref": "latest"
}
```
