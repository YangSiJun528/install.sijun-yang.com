import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRawGitHubUrl,
  handleRequest,
  parsePublicRoute,
  parseVersionOverride,
  resolveLatestReleaseTag,
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
      ref: "latest",
      path: "install/jungle-bell.sh",
    },
    {
      owner: "cf",
      repo: "workers-sdk",
      file: "install.sh",
      ref: "latest",
      path: "tools/install.sh",
    },
  ],
};

const env = {
  CONFIG_JSON: JSON.stringify(config),
  LATEST_TAGS_JSON: JSON.stringify({
    "YangSiJun528/jungle-bell": "v0.2.5",
    "cloudflare/workers-sdk": "v1.2.3",
  }),
};

test("redirects default-owner repo/file routes", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/jungle-bell.sh"),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://raw.githubusercontent.com/YangSiJun528/jungle-bell/v0.2.5/install/jungle-bell.sh",
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
    "https://raw.githubusercontent.com/cloudflare/workers-sdk/v1.2.3/tools/install.sh",
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
    "https://raw.githubusercontent.com/YangSiJun528/jungle-bell/v0.2.5/install/jungle-bell.sh",
  );
});

test("uses explicit tag query instead of latest", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/jungle-bell.sh?tag=v0.2.4"),
    env,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://raw.githubusercontent.com/YangSiJun528/jungle-bell/v0.2.4/install/jungle-bell.sh",
  );
});

test("rejects invalid explicit versions", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/jungle-bell/jungle-bell.sh?tag=main"),
    env,
  );

  assert.equal(response.status, 400);
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

test("health check verifies config availability", async () => {
  const response = await handleRequest(
    new Request("https://install.sijun-yang.com/healthz"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "ok\n");
});

test("health check reports unavailable config", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const response = await handleRequest(
      new Request("https://install.sijun-yang.com/healthz"),
      { CONFIG_JSON: "not json" },
    );

    assert.equal(response.status, 503);
    assert.equal(await response.text(), "Health check failed\n");
  } finally {
    console.warn = originalWarn;
  }
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

test("parses version overrides", () => {
  assert.deepEqual(parseVersionOverride(new URLSearchParams("")), {
    ok: true,
    tag: null,
  });
  assert.deepEqual(parseVersionOverride(new URLSearchParams("tag=v0.2.5")), {
    ok: true,
    tag: "v0.2.5",
  });
  assert.equal(parseVersionOverride(new URLSearchParams("tag=main")).ok, false);
  assert.equal(
    parseVersionOverride(new URLSearchParams("tag=v0.2.5&tag=v0.2.4")).ok,
    false,
  );
});

test("resolves configured latest tags", async () => {
  assert.equal(await resolveLatestReleaseTag("YangSiJun528", "jungle-bell", env), "v0.2.5");
});

test("caches fetched latest release tags in memory", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000;
  const requests = [];
  Date.now = () => now;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return latestReleaseResponse("v1.2.3", {
      etag: '"latest-cache-etag"',
      lastModified: "Tue, 14 Apr 2026 02:24:26 GMT",
    });
  };

  try {
    const cacheEnv = { LATEST_TAG_CACHE_TTL_SECONDS: "30" };

    assert.equal(await resolveLatestReleaseTag("octocat", "cache-demo", cacheEnv), "v1.2.3");
    now += 29_000;
    assert.equal(await resolveLatestReleaseTag("octocat", "cache-demo", cacheEnv), "v1.2.3");

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      "https://api.github.com/repos/octocat/cache-demo/releases/latest",
    );
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("revalidates stale latest release tags conditionally", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000;
  const requests = [];
  Date.now = () => now;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return latestReleaseResponse("v2.0.0", {
        etag: '"latest-revalidate-etag"',
        lastModified: "Tue, 14 Apr 2026 02:24:26 GMT",
      });
    }
    return new Response(null, {
      status: 304,
      headers: {
        etag: '"latest-revalidate-etag"',
        "last-modified": "Tue, 14 Apr 2026 02:24:26 GMT",
      },
    });
  };

  try {
    const cacheEnv = {
      GITHUB_TOKEN: "token",
      LATEST_TAG_CACHE_TTL_SECONDS: "30",
    };

    assert.equal(await resolveLatestReleaseTag("octocat", "revalidate-demo", cacheEnv), "v2.0.0");
    now += 31_000;
    assert.equal(await resolveLatestReleaseTag("octocat", "revalidate-demo", cacheEnv), "v2.0.0");

    assert.equal(requests.length, 2);
    assert.equal(requests[1].options.headers["If-None-Match"], '"latest-revalidate-etag"');
    assert.equal(requests[1].options.headers.Authorization, "Bearer token");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
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

function latestReleaseResponse(tagName, { etag, lastModified }) {
  return new Response(JSON.stringify({ tag_name: tagName }), {
    status: 200,
    headers: {
      etag,
      "last-modified": lastModified,
      "content-type": "application/json",
    },
  });
}
