import { Hono } from "hono/tiny";
import { parseTemplate } from "url-template";
import redirects from "./redirects.json" with { type: "json" };

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function createApp(config = redirects) {
  const app = new Hono();

  app.get("/healthz", (c) => {
    c.header("Cache-Control", "no-store");
    return c.text("ok\n");
  });

  app.get("/info", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({
      endpoints: {
        "/healthz": "Health check",
        "/info": "Available routes",
      },
      redirects: config,
    });
  });

  for (const redirect of compileRedirects(config)) {
    registerRedirect(app, redirect);
  }

  return app;
}

function registerRedirect(app, redirect) {
  app.get(redirect.route, (c) => handleRedirect(c, redirect));
}

function handleRedirect(c, redirect) {
  const destination = resolveRedirect(
    redirect,
    c.req.param(),
    c.req.queries(),
  );
  if (!destination) {
    return c.text("Bad Request\n", 400);
  }

  c.header("Cache-Control", "no-store");
  return c.redirect(destination, 302);
}

export function compileRedirects(config) {
  return Object.entries(config)
    .map(([path, value]) => {
      const { url, defaults = {} } =
        typeof value === "string" ? { url: value } : value;
      const pathNames = parsePlaceholderNames(path);
      const requiredNames = [...new Set(parsePlaceholderNames(url))];

      return {
        route: path.replace(PLACEHOLDER, ":$1"),
        template: parseTemplate(url),
        defaults,
        pathNames,
        requiredNames,
        pathParamCount: pathNames.length,
      };
    })
    .sort(
      (left, right) =>
        left.pathParamCount - right.pathParamCount ||
        right.route.length - left.route.length,
    );
}

export function resolveRedirect(redirect, path, query) {
  for (const [name, values] of Object.entries(query)) {
    if (
      redirect.pathNames.includes(name) ||
      !templateUsesVariable(redirect.template, name) ||
      values.length !== 1
    ) {
      return null;
    }
  }

  const values = { ...redirect.defaults, ...path };
  for (const [name, [value]] of Object.entries(query)) {
    values[name] = value;
  }

  if (redirect.requiredNames.some((name) => !Object.hasOwn(values, name))) {
    return null;
  }

  return redirect.template.expand(values);
}

function parsePlaceholderNames(value) {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function templateUsesVariable(template, name) {
  return (
    template.expand({ [name]: "template-variable-value" }) !==
    template.expand({})
  );
}

export default createApp();
