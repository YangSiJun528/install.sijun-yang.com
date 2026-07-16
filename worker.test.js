import assert from "node:assert/strict";
import test from "node:test";
import redirects from "./redirects.json" with { type: "json" };
import app, { compileRedirects, createApp, resolveRedirect } from "./worker.js";

const origin = "https://install.sijun-yang.com";
const request = (path, init) => app.request(`${origin}${path}`, init);

test("serves the health check", async () => {
  const response = await request("/healthz");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "ok\n");
});

test("describes every available route", async () => {
  const response = await request("/info");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    endpoints: {
      "/healthz": "Health check",
      "/info": "Available routes",
    },
    redirects,
  });
});

test("redirects the root to the GitHub repository", async () => {
  const response = await request("/");

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), redirects["/"]);
});

test("redirects latest and explicit release versions", async () => {
  const latest = await request("/jungle-bell.sh/latest");
  const version = await request("/jungle-bell.sh/v1.2.3");

  assert.equal(latest.status, 302);
  assert.equal(
    latest.headers.get("Location"),
    "https://github.com/YangSiJun528/jungle-bell/releases/latest/download/jungle-bell.sh",
  );
  assert.equal(version.status, 302);
  assert.equal(
    version.headers.get("Location"),
    "https://github.com/YangSiJun528/jungle-bell/releases/download/v1.2.3/jungle-bell.sh",
  );
});

test("matches static paths before dynamic paths", async () => {
  const response = await request("/jungle-bell.ps1/latest");

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://github.com/YangSiJun528/jungle-bell/releases/latest/download/jungle-bell.ps1",
  );
});

test("fills query placeholders from defaults and request values", async () => {
  const customApp = createApp({
    "/tool/{version}": {
      url: "https://example.com/releases/{version}/tool-{os}-{arch}.tar.gz",
      defaults: { os: "linux", arch: "amd64" },
    },
  });

  const defaults = await customApp.request(`${origin}/tool/v1.0.0`);
  const override = await customApp.request(
    `${origin}/tool/v1.0.0?arch=arm64&os=darwin`,
  );

  assert.equal(defaults.status, 302);
  assert.equal(
    defaults.headers.get("Location"),
    "https://example.com/releases/v1.0.0/tool-linux-amd64.tar.gz",
  );
  assert.equal(override.status, 302);
  assert.equal(
    override.headers.get("Location"),
    "https://example.com/releases/v1.0.0/tool-darwin-arm64.tar.gz",
  );
});

test("requires URL placeholders without defaults", async () => {
  const customApp = createApp({
    "/tool/{version}": "https://example.com/{version}/tool-{os}-{arch}.tar.gz",
  });

  const missing = await customApp.request(`${origin}/tool/v1.0.0?os=linux`);
  const complete = await customApp.request(
    `${origin}/tool/v1.0.0?os=linux&arch=amd64`,
  );

  assert.equal(missing.status, 400);
  assert.equal(await missing.text(), "Bad Request\n");
  assert.equal(complete.status, 302);
});

for (const query of [
  "?unknown=value",
  "?arch=amd64&unknown=value",
  "?arch=amd64&arch=arm64",
]) {
  test(`rejects invalid query parameters ${query}`, async () => {
    const customApp = createApp({
      "/tool": {
        url: "https://example.com/tool-{arch}.tar.gz",
        defaults: { arch: "amd64" },
      },
    });
    const response = await customApp.request(`${origin}/tool${query}`);

    assert.equal(response.status, 400);
  });
}

test("encodes path and query values before substitution", () => {
  const [redirect] = compileRedirects({
    "/tool/{version}": "https://example.com/{version}/tool-{arch}-{arch}.tgz",
  });

  assert.equal(
    resolveRedirect(redirect, { version: "release/1" }, { arch: ["x 64"] }),
    "https://example.com/release%2F1/tool-x%2064-x%2064.tgz",
  );
});

for (const path of ["/jungle-bell.sh", "/install.sh", "/v1/jungle-bell.sh"]) {
  test(`does not redirect unknown path ${path}`, async () => {
    const response = await request(path);

    assert.equal(response.status, 404);
  });
}

test("does not redirect unsupported methods", async () => {
  const response = await request("/jungle-bell.sh/latest", { method: "POST" });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("Location"), null);
});

test("automatically serves HEAD redirects without a body", async () => {
  const response = await request("/jungle-bell.sh/latest", { method: "HEAD" });

  assert.equal(response.status, 302);
  assert.equal(await response.text(), "");
});
