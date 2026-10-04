import assert from "node:assert/strict";
import test from "node:test";
import {
  findNextCourse,
  resolveCourseOccurrences,
} from "../lib/course-schedule.ts";

const baseCourse = {
  id: 1,
  name: "操作系统",
  teacher: "林老师",
  location: "A101",
  color: null,
  dayOfWeek: 1,
  startPeriod: 1,
  endPeriod: 2,
  startWeek: 1,
  endWeek: 16,
  weekType: "all",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const baseData = {
  courses: [baseCourse],
  overrides: [],
  semesterStart: "2026-09-07",
  totalWeeks: 16,
  reminderEnabled: true,
  reminderMinutes: 10,
  periodStarts: [
    "08:00", "08:50", "10:00", "10:50", "14:00", "14:50",
    "16:00", "16:50", "19:00", "19:50", "20:40", "21:30",
  ],
};

test("解析当前周当天课程，并映射节次开始时间", () => {
  const rows = resolveCourseOccurrences(baseData, new Date(2026, 8, 7, 7, 30));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].course.name, "操作系统");
  assert.equal(rows[0].week, 1);
  assert.equal(rows[0].startAt.getHours(), 8);
  assert.equal(rows[0].startAt.getMinutes(), 0);
});

test("遵守单双周，并忽略停课周", () => {
  const oddData = {
    ...baseData,
    courses: [{ ...baseCourse, weekType: "odd" }],
  };
  assert.equal(resolveCourseOccurrences(oddData, new Date(2026, 8, 14, 7, 30)).length, 0);

  const cancelledData = {
    ...baseData,
    overrides: [{
      id: 1,
      courseId: 1,
      week: 1,
      action: "cancel",
      dayOfWeek: null,
      startPeriod: null,
      endPeriod: null,
      location: null,
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
    }],
  };
  assert.equal(resolveCourseOccurrences(cancelledData, new Date(2026, 8, 7, 7, 30)).length, 0);
});

test("单周调课使用调整后的星期、节次与地点", () => {
  const adjustedData = {
    ...baseData,
    overrides: [{
      id: 2,
      courseId: 1,
      week: 1,
      action: "custom",
      dayOfWeek: 2,
      startPeriod: 3,
      endPeriod: 4,
      location: "B202",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
    }],
  };

  assert.equal(resolveCourseOccurrences(adjustedData, new Date(2026, 8, 7, 9, 0)).length, 0);
  const rows = resolveCourseOccurrences(adjustedData, new Date(2026, 8, 8, 9, 0));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location, "B202");
  assert.equal(rows[0].startAt.getHours(), 10);
});

test("只返回尚未开始的最近课程", () => {
  const data = {
    ...baseData,
    courses: [
      baseCourse,
      { ...baseCourse, id: 2, name: "编译原理", startPeriod: 3, endPeriod: 4 },
    ],
  };

  const next = findNextCourse(data, new Date(2026, 8, 7, 8, 30));
  assert.equal(next?.course.name, "编译原理");
  assert.equal(next?.startAt.getHours(), 10);
});
