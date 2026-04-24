# install.sijun-yang.com

Cloudflare Worker redirector for short install URLs.

Public URLs keep only the repository name and file name:

```text
https://install.sijun-yang.com/jungle-bell/jungle-bell.sh
https://install.sijun-yang.com/jungle-bell/jungle-bell.ps1
https://install.sijun-yang.com/@owner/repo/install.sh
```

The Worker reads `redirects.json` and redirects only registered files to their
GitHub raw file URLs. Repo-internal folders are configured in JSON, not shown in
public URLs.

## Configure Redirects

```json
{
  "repo": "jungle-bell",
  "file": "jungle-bell.sh",
  "ref": "main",
  "path": "install/jungle-bell.sh"
}
```

For the default owner (`YangSiJun528`), omit `owner`. For another owner or org,
set `owner`, or add an alias in `owner_aliases` and use `/@alias/repo/file`.

## Commands

```bash
npm run check
npm run dev
npm run deploy
```

Before the repo is pushed to `main`, local Worker routes can use the local
config through `CONFIG_JSON`:

```bash
CONFIG_JSON="$(cat redirects.json)" npm run dev
```

Required GitHub secrets for deploy:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Cloudflare Workers Builds can also deploy this repo directly. If using Workers
Builds, exclude `redirects.json` from build watch paths so redirect table updates do
not redeploy Worker code.
