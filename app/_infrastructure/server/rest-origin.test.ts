import assert from "node:assert/strict";
import { test } from "node:test";
import { restOrigin } from "./rest-origin.ts";

test("REST origin allows HTTPS, loopback HTTP and the ohpin-be container only", () => {
  assert.equal(restOrigin("https://ohpinbe.newdawn.co.kr"), "https://ohpinbe.newdawn.co.kr");
  assert.equal(restOrigin("http://ohpin-be:8080"), "http://ohpin-be:8080");
  assert.equal(restOrigin("http://127.0.0.1:8082"), "http://127.0.0.1:8082");
  for (const value of ["http://unsafe.example", "http://ohpin-be.example.com", "https://ohpinbe.newdawn.co.kr/api", "https://user:pw@ohpinbe.newdawn.co.kr", "not a url"]) {
    assert.equal(restOrigin(value), null, value);
  }
});
