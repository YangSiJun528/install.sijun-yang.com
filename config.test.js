import assert from "node:assert/strict";
import test from "node:test";
import redirects from "./redirects.json" with { type: "json" };

const placeholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const reservedPaths = new Set(["/healthz", "/info"]);

function placeholderNames(value, label) {
  const names = [...value.matchAll(placeholder)].map((match) => match[1]);
  assert.doesNotMatch(value.replace(placeholder, ""), /[{}]/, label);
  return names;
}

test("declares valid redirect configuration", () => {
  const routePatterns = new Set();

  for (const [path, value] of Object.entries(redirects)) {
    assert.ok(path.startsWith("/") && !/[?#]/.test(path), path);
    assert.ok(!reservedPaths.has(path), `${path}: reserved path`);

    const pathNames = placeholderNames(path, path);
    assert.equal(new Set(pathNames).size, pathNames.length, path);
    for (const segment of path.split("/").slice(1)) {
      if (/[{}]/.test(segment)) {
        assert.match(segment, /^\{[A-Za-z_][A-Za-z0-9_]*\}$/, path);
      }
    }

    const entry = typeof value === "string" ? { url: value } : value;
    assert.deepEqual(
      Object.keys(entry).filter((name) => !["url", "defaults"].includes(name)),
      [],
      path,
    );
    assert.ok(typeof entry.url === "string" && entry.url.length > 0, path);

    const urlNames = placeholderNames(entry.url, path);
    for (const name of pathNames) {
      assert.ok(urlNames.includes(name), `${path}: unused {${name}}`);
    }

    const queryNames = urlNames.filter((name) => !pathNames.includes(name));
    for (const [name, defaultValue] of Object.entries(entry.defaults ?? {})) {
      assert.ok(queryNames.includes(name), `${path}: invalid default ${name}`);
      assert.equal(typeof defaultValue, "string", path);
    }

    const routePattern = path.replace(placeholder, "{}");
    assert.ok(!routePatterns.has(routePattern), `${path}: duplicate route`);
    routePatterns.add(routePattern);
  }
});
