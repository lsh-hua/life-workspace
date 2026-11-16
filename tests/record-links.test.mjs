import assert from "node:assert/strict";
import test from "node:test";
import { recordDate, recordHref, recordId, recordTarget } from "../lib/record-links.ts";

test("搜索结果使用记录主键和日期构造真实地址", () => {
  assert.equal(recordHref("tasks", { id: 12 }), "/tasks/12");
  assert.equal(recordHref("events", { id: 3, date: "2026-11-02" }), "/calendar?date=2026-11-02&event=3");
  assert.equal(recordHref("inspirations", { id: 5 }), "/inspiration?record=5");
  assert.equal(recordHref("reviews", { id: 8, date: "2024-02-29" }), "/review?date=2024-02-29&record=8");
});

test("无效主键与日期不会变成可导航链接", () => {
  for (const value of [null, "", "0", "-1", "1.5", "01", "1e2", "9007199254740992", "javascript:alert(1)"]) {
    assert.equal(recordId(value), null);
  }
  for (const value of [null, "", "2026-02-29", "2026-13-01", "2026-01-32", "0000-01-01", "2026-1-01", "2026-01-01T00:00:00Z"]) {
    assert.equal(recordDate(value), null);
  }
  assert.equal(recordHref("events", { id: 1, date: "2026-02-29" }), null);
  assert.equal(recordHref("reviews", { id: -1, date: "2026-10-27" }), null);
});

test("同名重复参数和缺少日期的历史记录链接被拒绝", () => {
  for (const query of ["date=2026-10-27&event=1&event=2", "date=2026-10-27&date=2026-10-28&event=1", "event=1"]) {
    assert.equal(recordTarget(new URLSearchParams(query), "events").invalid, true);
  }
  assert.deepEqual(recordTarget(new URLSearchParams("date=2026-10-27&record=7"), "reviews"), {
    id: 7, date: "2026-10-27", requested: true, invalid: false,
  });
});

test("无定位参数保留普通页面入口，日期入口可单独选中一天", () => {
  assert.deepEqual(recordTarget(new URLSearchParams(), "inspirations"), { id: null, date: null, requested: false, invalid: false });
  assert.deepEqual(recordTarget(new URLSearchParams("date=2026-11-02"), "events"), { id: null, date: "2026-11-02", requested: true, invalid: false });
  assert.equal(recordTarget(new URLSearchParams("record=4&record=5"), "inspirations").invalid, true);
});
