import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, parseConfigText, validateConfig } from "./worker.js";

const origin = "https://install.sijun-yang.com";
const releases = "https://github.com/YangSiJun528/jungle-bell/releases";

test("shows project and route information on the landing page", async () => {
  const response = await handleRequest(new Request(`${origin}/`));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.match(body, /Project: https:\/\/github\.com\/YangSiJun528\/jungle-bell/);
  assert.match(body, /\/jungle-bell\.sh/);
  assert.match(body, /\/jungle-bell\.ps1/);
  assert.match(body, /\?tag=vX\.Y\.Z/);
});

test("HEAD landing page has no body", async () => {
  const response = await handleRequest(
    new Request(`${origin}/`, { method: "HEAD" }),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("health check returns ok", async () => {
  const response = await handleRequest(new Request(`${origin}/healthz`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "ok\n");
});

test("HEAD health check has no body", async () => {
  const response = await handleRequest(
    new Request(`${origin}/healthz`, { method: "HEAD" }),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("redirects macOS script to GitHub latest release asset", async () => {
  const response = await handleRequest(new Request(`${origin}/jungle-bell.sh`));

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${releases}/latest/download/jungle-bell.sh`,
  );
});

test("redirects Windows script to GitHub latest release asset", async () => {
  const response = await handleRequest(new Request(`${origin}/jungle-bell.ps1`));

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${releases}/latest/download/jungle-bell.ps1`,
  );
});

test("treats tag=latest as the latest release asset", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.sh?tag=latest`),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${releases}/latest/download/jungle-bell.sh`,
  );
});

test("redirects explicit semver tags to exact release assets", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.sh?tag=v1.2.3`),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${releases}/download/v1.2.3/jungle-bell.sh`,
  );
});

test("redirects prerelease tags to exact release assets", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.ps1?tag=v1.2.3-beta.1`),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${releases}/download/v1.2.3-beta.1/jungle-bell.ps1`,
  );
});

test("HEAD redirect has no body", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.sh`, { method: "HEAD" }),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${releases}/latest/download/jungle-bell.sh`,
  );
  assert.equal(await response.text(), "");
});

test("rejects invalid tags as not found", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.sh?tag=main`),
  );

  assert.equal(response.status, 404);
});

test("rejects duplicate tag parameters as not found", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.sh?tag=v1.2.3&tag=v1.2.4`),
  );

  assert.equal(response.status, 404);
});

test("does not support path-based versions", async () => {
  const response = await handleRequest(
    new Request(`${origin}/v1.2.3/jungle-bell.sh`),
  );

  assert.equal(response.status, 404);
});

test("does not support legacy repo/file routes", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell/jungle-bell.sh`),
  );

  assert.equal(response.status, 404);
});

test("rejects unknown assets", async () => {
  const response = await handleRequest(new Request(`${origin}/install.sh`));

  assert.equal(response.status, 404);
});

test("rejects unsupported methods", async () => {
  const response = await handleRequest(
    new Request(`${origin}/jungle-bell.sh`, { method: "POST" }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, HEAD");
  assert.equal(await response.text(), "Method Not Allowed\n");
});

test("validates redirect config entries", () => {
  const config = validateConfig({
    version: 1,
    default_owner: "YangSiJun528",
    files: [
      {
        repo: "jungle-bell",
        file: "jungle-bell.sh",
        ref: "latest",
      },
      {
        owner: "OtherOwner",
        repo: "jungle-bell",
        file: "jungle-bell.ps1",
        ref: "v1.2.3",
      },
    ],
  });

  assert.deepEqual(config.files, [
    {
      owner: "YangSiJun528",
      repo: "jungle-bell",
      file: "jungle-bell.sh",
      ref: "latest",
    },
    {
      owner: "OtherOwner",
      repo: "jungle-bell",
      file: "jungle-bell.ps1",
      ref: "v1.2.3",
    },
  ]);
});

test("rejects duplicate public file routes in redirect config", () => {
  assert.throws(
    () =>
      validateConfig({
        version: 1,
        default_owner: "YangSiJun528",
        files: [
          {
            repo: "jungle-bell",
            file: "jungle-bell.sh",
            ref: "latest",
          },
          {
            repo: "other-repo",
            file: "jungle-bell.sh",
            ref: "latest",
          },
        ],
      }),
    /duplicate public file route/,
  );
});

test("rejects owner aliases in redirect config", () => {
  assert.throws(
    () =>
      validateConfig({
        version: 1,
        default_owner: "YangSiJun528",
        owner_aliases: {
          me: "YangSiJun528",
        },
        files: [],
      }),
    /owner_aliases is not supported/,
  );
});

test("parses redirect config text", () => {
  const config = parseConfigText(
    JSON.stringify({
      version: 1,
      default_owner: "YangSiJun528",
      files: [
        {
          repo: "jungle-bell",
          file: "jungle-bell.sh",
        },
      ],
    }),
  );

  assert.equal(config.files[0].ref, "latest");
});
