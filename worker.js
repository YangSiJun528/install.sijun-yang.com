const DEFAULT_CONFIG_URL =
  "https://raw.githubusercontent.com/YangSiJun528/install.sijun-yang.com/main/redirects.json";
const DEFAULT_CONFIG_CACHE_TTL_SECONDS = 60;
const DEFAULT_LATEST_TAG_CACHE_TTL_SECONDS = 300;
const DEFAULT_REDIRECT_STATUS = 302;
const LATEST_REF = "latest";
const ROUTE_OWNER_PREFIX = "@";
const SUPPORTED_METHODS = new Set(["GET", "HEAD"]);

const IDENTIFIER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,160}$/;
const REF_RE = /^[A-Za-z0-9._-]{1,120}$/;
const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

export async function handleRequest(request, env = {}, ctx = undefined) {
  const method = request.method;
  if (!SUPPORTED_METHODS.has(method)) {
    return methodNotAllowed(method);
  }

  const url = new URL(request.url);
  if (url.pathname === "/") {
    return landingResponse(method);
  }

  const routeResult = parsePublicRoute(url.pathname);
  if (!routeResult.ok) {
    return notFound(method);
  }
  const route = routeResult.value;

  const versionResult = parseVersionOverride(url.searchParams);
  if (!versionResult.ok) {
    return badRequest(versionResult.error, method);
  }
  const versionTag = versionResult.tag;

  const configResult = await loadConfigForRequest(env, method);
  if (!configResult.ok) {
    return configResult.response;
  }
  const config = configResult.value;

  const targetResult = await resolveTargetForRequest(
    config,
    route,
    versionTag,
    env,
    method,
  );
  if (!targetResult.ok) {
    return targetResult.response;
  }
  const target = targetResult.value;

  if (!target) {
    return notFound(method);
  }

  return redirectResponse(target, redirectStatus(env), method);
}

export async function loadConfig(env = {}) {
  if (typeof env.CONFIG_JSON === "string" && env.CONFIG_JSON.trim() !== "") {
    return parseConfigText(env.CONFIG_JSON, "CONFIG_JSON");
  }

  const configUrl = typeof env.CONFIG_URL === "string" && env.CONFIG_URL.trim() !== ""
    ? env.CONFIG_URL
    : DEFAULT_CONFIG_URL;
  const cacheTtl = configCacheTtl(env);
  const response = await fetch(configUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "install.sijun-yang.com-worker",
    },
    cf: {
      cacheEverything: true,
      cacheTtl,
    },
  });

  if (!response.ok) {
    throw new Error(`config fetch failed: ${response.status}`);
  }

  return parseConfigText(await response.text(), configUrl);
}

export function parseConfigText(text, source = "config") {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON`);
  }

  return validateConfig(parsed);
}

export function validateConfig(config) {
  if (!isPlainObject(config)) {
    throw new Error("config must be an object");
  }
  if (config.version !== 1) {
    throw new Error("config.version must be 1");
  }
  if (!isValidOwner(config.default_owner)) {
    throw new Error("config.default_owner is invalid");
  }

  const aliases = validateOwnerAliases(config.owner_aliases ?? {});
  if (!Array.isArray(config.files)) {
    throw new Error("config.files must be an array");
  }

  const files = [];
  const keys = new Set();
  for (const [index, file] of config.files.entries()) {
    const normalized = normalizeFileEntry(file, config.default_owner, aliases, index);
    const key = lookupKey(normalized.owner, normalized.repo, normalized.file);
    if (keys.has(key)) {
      throw new Error(`duplicate file entry: ${key}`);
    }
    keys.add(key);
    files.push(normalized);
  }

  return {
    version: 1,
    default_owner: config.default_owner,
    owner_aliases: aliases,
    files,
  };
}

export function parsePublicRoute(pathname) {
  const rawSegments = pathname.split("/").filter(Boolean);
  let owner;
  let repo;
  let file;

  try {
    if (rawSegments.length === 2) {
      [repo, file] = rawSegments.map(decodeSegment);
      owner = null;
    } else if (
      rawSegments.length === 3 &&
      rawSegments[0].startsWith(ROUTE_OWNER_PREFIX) &&
      rawSegments[0].length > ROUTE_OWNER_PREFIX.length
    ) {
      owner = decodeSegment(rawSegments[0].slice(ROUTE_OWNER_PREFIX.length));
      repo = decodeSegment(rawSegments[1]);
      file = decodeSegment(rawSegments[2]);
    } else {
      return { ok: false };
    }
  } catch (error) {
    return { ok: false };
  }

  if (owner !== null && !isValidOwnerAliasOrOwner(owner)) {
    return { ok: false };
  }
  if (!isValidRepo(repo) || !isValidFileName(file)) {
    return { ok: false };
  }

  return { ok: true, value: { owner, repo, file } };
}

export function parseVersionOverride(searchParams) {
  const tags = searchParams.getAll("tag");
  if (tags.length > 1) {
    return { ok: false, error: "Specify tag only once" };
  }
  if (tags.length === 1) {
    const tag = tags[0];
    if (!isValidTag(tag)) {
      return { ok: false, error: "Invalid tag" };
    }
    return { ok: true, tag };
  }

  return { ok: true, tag: null };
}

export async function resolveTarget(config, route, versionTag = null, env = {}) {
  const owner = route.owner === null
    ? config.default_owner
    : config.owner_aliases[route.owner] ?? route.owner;
  const match = config.files.find(
    (file) =>
      file.owner === owner &&
      file.repo === route.repo &&
      file.file === route.file,
  );

  if (!match) {
    return null;
  }

  const ref = await resolveRef(match, versionTag, env);
  return buildRawGitHubUrl({ ...match, ref });
}

export async function resolveRef(file, versionTag = null, env = {}) {
  if (versionTag !== null) {
    return versionTag;
  }
  if (file.ref !== LATEST_REF) {
    return file.ref;
  }

  return resolveLatestReleaseTag(file.owner, file.repo, env);
}

export async function resolveLatestReleaseTag(owner, repo, env = {}) {
  const key = `${owner}/${repo}`;
  const configuredTags = parseLatestTags(env);
  if (configuredTags[key] !== undefined) {
    const tag = configuredTags[key];
    if (!isValidTag(tag)) {
      throw new Error(`invalid configured latest tag: ${key}`);
    }
    return tag;
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
    {
      headers: githubHeaders(env),
      cf: {
        cacheEverything: true,
        cacheTtl: latestTagCacheTtl(env),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`latest release lookup failed: ${owner}/${repo} ${response.status}`);
  }

  const release = await response.json();
  if (!isPlainObject(release) || !isValidTag(release.tag_name)) {
    throw new Error(`latest release tag is invalid: ${owner}/${repo}`);
  }
  return release.tag_name;
}

export function buildRawGitHubUrl(file) {
  return [
    "https://raw.githubusercontent.com",
    encodeURIComponent(file.owner),
    encodeURIComponent(file.repo),
    encodeURIComponent(file.ref),
    encodePath(file.path),
  ].join("/");
}

function validateOwnerAliases(ownerAliases) {
  if (!isPlainObject(ownerAliases)) {
    throw new Error("config.owner_aliases must be an object");
  }

  const aliases = {};
  for (const [alias, owner] of Object.entries(ownerAliases)) {
    if (!isValidOwnerAliasOrOwner(alias)) {
      throw new Error(`owner alias is invalid: ${alias}`);
    }
    if (!isValidOwner(owner)) {
      throw new Error(`owner alias target is invalid: ${alias}`);
    }
    aliases[alias] = owner;
  }

  return aliases;
}

function normalizeFileEntry(file, defaultOwner, aliases, index) {
  if (!isPlainObject(file)) {
    throw new Error(`config.files[${index}] must be an object`);
  }

  const rawOwner = file.owner ?? defaultOwner;
  const owner = aliases[rawOwner] ?? rawOwner;
  const normalized = {
    owner,
    repo: file.repo,
    file: file.file,
    ref: file.ref,
    path: file.path,
  };

  if (!isValidOwner(normalized.owner)) {
    throw new Error(`config.files[${index}].owner is invalid`);
  }
  if (!isValidRepo(normalized.repo)) {
    throw new Error(`config.files[${index}].repo is invalid`);
  }
  if (!isValidFileName(normalized.file)) {
    throw new Error(`config.files[${index}].file is invalid`);
  }
  if (!isValidRef(normalized.ref)) {
    throw new Error(`config.files[${index}].ref is invalid`);
  }
  if (!isValidPath(normalized.path)) {
    throw new Error(`config.files[${index}].path is invalid`);
  }
  if (basename(normalized.path) !== normalized.file) {
    throw new Error(`config.files[${index}].file must match the path basename`);
  }

  return normalized;
}

function decodeSegment(segment) {
  const decoded = decodeURIComponent(segment);
  if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
    throw new Error("invalid path segment");
  }
  return decoded;
}

function lookupKey(owner, repo, file) {
  return `${owner}/${repo}/${file}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidOwner(value) {
  return typeof value === "string" && IDENTIFIER_RE.test(value);
}

function isValidOwnerAliasOrOwner(value) {
  return typeof value === "string" && IDENTIFIER_RE.test(value);
}

function isValidRepo(value) {
  return (
    typeof value === "string" &&
    REPO_RE.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function isValidFileName(value) {
  return (
    typeof value === "string" &&
    FILE_RE.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function isValidRef(value) {
  return typeof value === "string" && REF_RE.test(value);
}

function isValidTag(value) {
  return typeof value === "string" && TAG_RE.test(value);
}

function isValidPath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\")) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => {
    return (
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      !segment.includes("\0") &&
      segment.length <= 160
    );
  });
}

function basename(path) {
  const segments = path.split("/");
  return segments[segments.length - 1];
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function configCacheTtl(env) {
  const parsed = Number(env.CONFIG_CACHE_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CONFIG_CACHE_TTL_SECONDS;
  }
  return Math.max(30, Math.min(3600, Math.trunc(parsed)));
}

function latestTagCacheTtl(env) {
  const parsed = Number(env.LATEST_TAG_CACHE_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LATEST_TAG_CACHE_TTL_SECONDS;
  }
  return Math.max(30, Math.min(3600, Math.trunc(parsed)));
}

function parseLatestTags(env) {
  if (typeof env.LATEST_TAGS_JSON !== "string" || env.LATEST_TAGS_JSON.trim() === "") {
    return {};
  }
  const parsed = JSON.parse(env.LATEST_TAGS_JSON);
  if (!isPlainObject(parsed)) {
    throw new Error("LATEST_TAGS_JSON must be an object");
  }
  return parsed;
}

function githubHeaders(env) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "install.sijun-yang.com-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (typeof env.GITHUB_TOKEN === "string" && env.GITHUB_TOKEN.trim() !== "") {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }
  return headers;
}

function redirectStatus(env) {
  const parsed = Number(env.REDIRECT_STATUS);
  if (parsed === 301 || parsed === 302 || parsed === 307 || parsed === 308) {
    return parsed;
  }
  return DEFAULT_REDIRECT_STATUS;
}

async function loadConfigForRequest(env, method) {
  try {
    return { ok: true, value: await loadConfig(env) };
  } catch (error) {
    return {
      ok: false,
      response: serviceUnavailable("Configuration unavailable", method),
    };
  }
}

async function resolveTargetForRequest(config, route, versionTag, env, method) {
  try {
    return {
      ok: true,
      value: await resolveTarget(config, route, versionTag, env),
    };
  } catch (error) {
    return {
      ok: false,
      response: serviceUnavailable("Target unavailable", method),
    };
  }
}

function landingResponse(method) {
  return textResponse(landingText(), {
    method,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

function badRequest(message, method) {
  return textResponse(`${message}\n`, {
    status: 400,
    method,
    headers: { "Cache-Control": "no-store" },
  });
}

function methodNotAllowed(method) {
  return textResponse("Method Not Allowed\n", {
    status: 405,
    method,
    headers: { Allow: "GET, HEAD" },
  });
}

function serviceUnavailable(message, method) {
  return textResponse(`${message}\n`, {
    status: 503,
    method,
    headers: { "Cache-Control": "no-store" },
  });
}

function redirectResponse(location, status, method) {
  return new Response(method === "HEAD" ? null : "", {
    status,
    headers: withSecurityHeaders({
      Location: location,
      "Cache-Control": "no-store",
    }),
  });
}

function notFound(method) {
  return textResponse("Not Found\n", {
    status: 404,
    method,
    headers: { "Cache-Control": "no-store" },
  });
}

function textResponse(body, options = {}) {
  const status = options.status ?? 200;
  return new Response(options.method === "HEAD" ? null : body, {
    status,
    headers: withSecurityHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      ...options.headers,
    }),
  });
}

function withSecurityHeaders(headers) {
  return {
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  };
}

function landingText() {
  return [
    "install.sijun-yang.com",
    "",
    "Use /<repo>/<file> for YangSiJun528 repos.",
    "Use /@<owner-or-alias>/<repo>/<file> for other owners.",
    "Use ?tag=vX.Y.Z for exact versions.",
    "",
    "Examples:",
    "  /jungle-bell/jungle-bell.sh",
    "  /jungle-bell/jungle-bell.ps1",
    "",
  ].join("\n");
}
