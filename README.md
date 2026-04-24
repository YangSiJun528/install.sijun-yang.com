# install.sijun-yang.com

제가 관리하는 개인 프로젝트용 짧은 설치 주소를 제공하는 프로젝트입니다.

미리 허용한 파일 주소로만 이동할 수 있으며, 요청자가 임의의 외부 주소로 리다이렉트 대상을 바꿀 수 없도록 제한합니다.

## 사용 방법

최신 버전 설치:

```bash
curl -fsSL https://install.sijun-yang.com/<repo>/<file> | sh
```

```powershell
irm https://install.sijun-yang.com/<repo>/<file> | iex
```

특정 태그 설치:

```bash
curl -fsSL "https://install.sijun-yang.com/<repo>/<file>?tag=vX.Y.Z" | sh
```

```powershell
irm "https://install.sijun-yang.com/<repo>/<file>?tag=vX.Y.Z" | iex
```

지원되는 주소 형식 예:

```text
https://install.sijun-yang.com/<repo>/<file>
https://install.sijun-yang.com/<repo>/<file>?tag=vX.Y.Z
https://install.sijun-yang.com/@<owner>/<repo>/<file>
https://install.sijun-yang.com/@<owner>/<repo>/<file>?tag=vX.Y.Z
```
