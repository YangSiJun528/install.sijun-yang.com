import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRawGitHubUrl,
  handleRequest,
  parsePublicRoute,
  validateConfig,
} from "./worker.js";

const config = {
  version: 1,
  default_owner: "YangSiJun528",
  owner_aliases: {
    me: "YangSiJun528",
    cf: "cloudflare",
  },
  files: [
    {
      repo: "jungle-bell",
      file: "jungle-bell.sh",
      ref: "main",
      path: "install/jungle-bell.sh",
    },
    {
      owner: "cf",
      repo: "workers-sdk",
      file: "install.sh",
      ref: "main",
      path: "tools/install.sh",
    },
  ],
};

const env = {
  CONFIG_JSON: JSON.stringify(config),
};

test("redirects default-owner repo/file routes", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/jungle-bell.sh"),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://raw.githubusercontent.com/YangSiJun528/jungle-bell/main/install/jungle-bell.sh",
  );
});

test("redirects alias owner routes", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/@cf/workers-sdk/install.sh"),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/tools/install.sh",
  );
});

test("does not expose internal file paths as public routes", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/install/jungle-bell.sh"),
    env,
  );

  assert.equal(response.status, 404);
});

test("ignores query parameters when resolving targets", async () => {
  const response = await handleRequest(
    new Request(
      "https://install.sijun-yang.com/jungle-bell/jungle-bell.sh?target=https://evil.example",
    ),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://raw.githubusercontent.com/YangSiJun528/jungle-bell/main/install/jungle-bell.sh",
  );
});

test("rejects unsupported methods", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/jungle-bell.sh", {
      method: "POST",
    }),
    env,
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, HEAD");
});

test("HEAD redirect has no body", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/jungle-bell.sh", {
      method: "HEAD",
    }),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(await response.text(), "");
});

test("validates duplicate owner/repo/file entries", () => {
  assert.throws(
    () =>
      validateConfig({
        ...config,
        files: [config.files[0], config.files[0]],
      }),
    /duplicate file entry/,
  );
});

test("requires visible file to match the configured path basename", () => {
  assert.throws(
    () =>
      validateConfig({
        ...config,
        files: [
          {
            repo: "jungle-bell",
            file: "install.sh",
            ref: "main",
            path: "install/jungle-bell.sh",
          },
        ],
      }),
    /file must match the path basename/,
  );
});

test("parses public routes", () => {
  assert.deepEqual(parsePublicRoute("/jungle-bell/jungle-bell.sh"), {
    ok: true,
    value: { owner: null, repo: "jungle-bell", file: "jungle-bell.sh" },
  });
  assert.deepEqual(parsePublicRoute("/@cf/workers-sdk/install.sh"), {
    ok: true,
    value: { owner: "cf", repo: "workers-sdk", file: "install.sh" },
  });
  assert.deepEqual(parsePublicRoute("/jungle-bell/install/jungle-bell.sh"), {
    ok: false,
  });
});

test("builds raw GitHub URLs with encoded path segments", () => {
  assert.equal(
    buildRawGitHubUrl({
      owner: "YangSiJun528",
      repo: "jungle-bell",
      ref: "v0.2.5",
      path: "install/jungle-bell.sh",
    }),
    "https://raw.githubusercontent.com/YangSiJun528/jungle-bell/v0.2.5/install/jungle-bell.sh",
  );
});
