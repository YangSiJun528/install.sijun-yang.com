import bundledConfig from "./redirects.json" with { type: "json" };

const DEFAULT_REF = "latest";
const HEALTH_PATH = "/healthz";
const SUPPORTED_METHODS = new Set(["GET", "HEAD"]);

const IDENTIFIER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,160}$/;
const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

let validatedBundledConfig;

export default {
  async fetch(request) {
    return handleRequest(request);
  },
};

export async function handleRequest(request) {
  const method = request.method;
  if (!SUPPORTED_METHODS.has(method)) {
    return methodNotAllowed(method);
  }

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.warn({
      event: "configuration_unavailable",
      error: error instanceof Error ? error.message : String(error),
    });
    return textResponse("Configuration unavailable\n", {
      status: 503,
      method,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const url = new URL(request.url);
  if (url.pathname === "/") {
    return landingResponse(config, method);
  }
  if (url.pathname === HEALTH_PATH) {
    return textResponse("ok\n", {
      method,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const file = findFileForPath(config, url.pathname);
  if (file === null) {
    return notFound(method);
  }

  const ref = parseRef(url.searchParams, file.ref);
  if (ref === null) {
    return notFound(method);
  }

  return redirectResponse(releaseAssetUrl(file, ref), method);
}

export function loadConfig() {
  validatedBundledConfig ??= validateConfig(bundledConfig);
  return validatedBundledConfig;
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
  if (Object.hasOwn(config, "owner_aliases")) {
    throw new Error("config.owner_aliases is not supported");
  }

  if (!Array.isArray(config.files)) {
    throw new Error("config.files must be an array");
  }

  const files = [];
  const publicRoutes = new Set();
  for (const [index, file] of config.files.entries()) {
    const normalized = normalizeFileEntry(file, config.default_owner, index);
    if (publicRoutes.has(normalized.file)) {
      throw new Error(`duplicate public file route: ${normalized.file}`);
    }
    publicRoutes.add(normalized.file);
    files.push(normalized);
  }

  return {
    version: 1,
    default_owner: config.default_owner,
    files,
  };
}

function normalizeFileEntry(file, defaultOwner, index) {
  if (!isPlainObject(file)) {
    throw new Error(`config.files[${index}] must be an object`);
  }

  const ref = file.ref ?? DEFAULT_REF;
  const normalized = {
    owner: file.owner ?? defaultOwner,
    repo: file.repo,
    file: file.file,
    ref,
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

  return normalized;
}

function findFileForPath(config, pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) {
    return null;
  }

  const requestedFile = segments[0];
  return config.files.find((file) => file.file === requestedFile) ?? null;
}

function parseRef(searchParams, defaultRef) {
  const tags = searchParams.getAll("tag");
  if (tags.length > 1) {
    return null;
  }
  if (tags.length === 0 || tags[0] === "") {
    return defaultRef;
  }
  if (tags[0] === DEFAULT_REF) {
    return DEFAULT_REF;
  }

  const tag = tags[0];
  return TAG_RE.test(tag) ? tag : null;
}

function releaseAssetUrl(file, ref) {
  const releasesUrl = `https://github.com/${encodeURIComponent(file.owner)}/${encodeURIComponent(file.repo)}/releases`;
  const asset = encodeURIComponent(file.file);
  if (ref === DEFAULT_REF) {
    return `${releasesUrl}/latest/download/${asset}`;
  }

  return `${releasesUrl}/download/${encodeURIComponent(ref)}/${asset}`;
}

function landingResponse(config, method) {
  return textResponse(landingText(config), {
    method,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

function landingText(config) {
  const firstFile = config.files[0];
  const projectUrl = firstFile === undefined
    ? "not configured"
    : `https://github.com/${firstFile.owner}/${firstFile.repo}`;
  const routes = config.files
    .map((file) => `  /${file.file}  ->  ${file.owner}/${file.repo}@${file.ref}:${file.file}`)
    .join("\n");

  return `install.sijun-yang.com

Project: ${projectUrl}

Short install URLs for release bootstrap scripts.

Install latest:
  macOS:   curl -fsSL https://install.sijun-yang.com/jungle-bell.sh | sh
  Windows: irm https://install.sijun-yang.com/jungle-bell.ps1 | iex

Install a specific release tag:
  macOS:   curl -fsSL 'https://install.sijun-yang.com/jungle-bell.sh?tag=vX.Y.Z' | sh
  Windows: irm 'https://install.sijun-yang.com/jungle-bell.ps1?tag=vX.Y.Z' | iex

Available routes:
${routes}
  /healthz  -> Worker health check
`;
}

function methodNotAllowed(method) {
  return textResponse("Method Not Allowed\n", {
    status: 405,
    method,
    headers: {
      Allow: "GET, HEAD",
      "Cache-Control": "no-store",
    },
  });
}

function redirectResponse(location, method) {
  return new Response(method === "HEAD" ? null : "", {
    status: 302,
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidOwner(value) {
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
  return value === DEFAULT_REF || isValidTag(value);
}

function isValidTag(value) {
  return typeof value === "string" && TAG_RE.test(value);
}
