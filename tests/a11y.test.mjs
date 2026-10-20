// Accessibility and error-state tests. These are HTTP-level checks on the rendered HTML
// (the full axe-core sweep was run by hand; these guard the rules most easily broken by a refactor).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const html = async (path) => {
  const res = await fetch(BASE + path, { redirect: "manual" });
  return { res, text: await res.text() };
};

describe("public pages", () => {
  for (const path of ["/", "/login", "/register"]) {
    test(`${path}: lang, title, exactly one h1`, async () => {
      const { res, text } = await html(path);
      assert.equal(res.status, 200);
      assert.match(text, /<html[^>]*\slang="en"/);
      assert.match(text, /<title>[^<]{3,}<\/title>/);
      assert.equal((text.match(/<h1[\s>]/g) ?? []).length, 1, "exactly one <h1>");
    });

    test(`${path}: every image has alt text and explicit dimensions`, async () => {
      const { text } = await html(path);
      for (const tag of text.match(/<img\b[^>]*>/g) ?? []) {
        assert.match(tag, /\salt=/, `missing alt: ${tag}`);
        assert.match(tag, /\swidth=/, `missing width: ${tag}`);
        assert.match(tag, /\sheight=/, `missing height: ${tag}`);
      }
    });
  }

  test("login and register form fields all have a label", async () => {
    for (const path of ["/login", "/register"]) {
      const { text } = await html(path);
      for (const tag of text.match(/<input\b[^>]*>/g) ?? []) {
        const id = tag.match(/\sid="([^"]+)"/)?.[1];
        assert.ok(id, `input without id: ${tag}`);
        assert.match(text, new RegExp(`<label[^>]*for="${id}"`), `no label for #${id} on ${path}`);
      }
    }
  });

  test("the register page's in-text link is underlined, not colour-only", async () => {
    const { text } = await html("/register");
    assert.match(text, /class="accent link-u"[^>]*>Log in/);
  });
});

describe("error states", () => {
  test("unknown route renders the friendly 404 page with a way back", async () => {
    const { res, text } = await html("/definitely-not-a-page");
    assert.equal(res.status, 404);
    assert.match(text, /Page not found/);
    assert.match(text, /href="\/"/);
  });
});
