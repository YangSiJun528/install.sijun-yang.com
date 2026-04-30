# install.sijun-yang.com

GitHub Releases 설치 스크립트용 짧은 주소를 제공하는 프로젝트입니다.

긴 GitHub Releases 주소 대신 `install.sijun-yang.com` 아래의 고정된 주소를 안내할 수 있게 해 줍니다.    
실제 설치 파일은 각 프로젝트의 GitHub Releases에 있으며, 이 서비스는 사용자가 접근한 짧은 주소를 알맞은 릴리스 파일로 연결합니다.

현재 등록된 프로젝트:

- Jungle Bell: https://github.com/YangSiJun528/jungle-bell

## 사용 방법

프로젝트별 설치 안내에서 아래와 같은 짧은 주소를 사용할 수 있습니다.

최신 버전 설치 스크립트:

```text
https://install.sijun-yang.com/jungle-bell.sh
https://install.sijun-yang.com/jungle-bell.ps1
```

특정 태그의 설치 스크립트:

```text
https://install.sijun-yang.com/jungle-bell.sh?tag=vX.Y.Z
https://install.sijun-yang.com/jungle-bell.ps1?tag=vX.Y.Z
```

`tag`가 없거나 `tag=latest`이면 GitHub Releases의 latest asset으로 이동합니다. 명시 태그는 `v1.2.3` 또는 prerelease semver tag를 사용할 수 있습니다.

## 지원되는 주소

현재 제공되는 주소 예시는 다음과 같습니다.

```text
https://install.sijun-yang.com/
https://install.sijun-yang.com/jungle-bell.sh
https://install.sijun-yang.com/jungle-bell.ps1
https://install.sijun-yang.com/jungle-bell.sh?tag=vX.Y.Z
https://install.sijun-yang.com/jungle-bell.ps1?tag=vX.Y.Z
```
