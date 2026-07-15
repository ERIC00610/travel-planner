import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readProjectFile(path) {
  return readFile(new URL("../" + path, import.meta.url), "utf8");
}

test("application shell exposes the five primary views and editor dialog", async () => {
  const html = await readProjectFile("index.html");

  for (const view of ["itinerary", "lodging", "bookings", "tasks", "settings"]) {
    assert.match(html, new RegExp('data-view="' + view + '"'));
  }
  assert.match(html, /<dialog[^>]+id="day-editor"/);
  assert.match(html, /aria-live="polite"/);
});

test("application uses GitHub Pages-safe relative asset paths", async () => {
  const html = await readProjectFile("index.html");

  assert.match(html, /href="\.\/assets\/styles\.css"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\//);
});

test("styles include mobile touch targets, focus visibility, and desktop breakpoint", async () => {
  const css = await readProjectFile("assets/styles.css");

  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(min-width:\s*900px\)/);
});
