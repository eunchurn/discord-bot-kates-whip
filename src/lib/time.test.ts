import { describe, expect, test } from "bun:test";

import { parseDays, parseLeadMinutes, parseTime } from "./time.ts";

describe("parseTime", () => {
  test("normalises 24h input", () => {
    expect(parseTime("20:00")).toBe("20:00");
    expect(parseTime("8:5")).toBe("08:05");
    expect(parseTime("0930")).toBe("09:30");
    expect(parseTime("930")).toBe("09:30");
  });

  test("accepts am/pm", () => {
    expect(parseTime("8pm")).toBe("20:00");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("12:30pm")).toBe("12:30");
  });

  test("rejects nonsense", () => {
    expect(parseTime("25:00")).toHaveProperty("error");
    expect(parseTime("banana")).toHaveProperty("error");
    expect(parseTime("20:99")).toHaveProperty("error");
  });
});

describe("parseDays", () => {
  test("weekly lists", () => {
    expect(parseDays("mon,thu")).toEqual({ kind: "weekly", weekdays: [1, 4] });
    expect(parseDays("SAT SUN")).toEqual({ kind: "weekly", weekdays: [6, 7] });
    expect(parseDays("일,수")).toEqual({ kind: "weekly", weekdays: [3, 7] });
  });

  test("daily and intervals", () => {
    expect(parseDays("daily")).toEqual({ kind: "daily" });
    expect(parseDays("every2")).toEqual({ kind: "interval", intervalDays: 2 });
    expect(parseDays("every 3 days")).toEqual({ kind: "interval", intervalDays: 3 });
    expect(parseDays("2d")).toEqual({ kind: "interval", intervalDays: 2 });
    // "every 1 day" is just daily.
    expect(parseDays("every1")).toEqual({ kind: "daily" });
  });

  test("rejects unknown tokens", () => {
    expect(parseDays("someday")).toHaveProperty("error");
    expect(parseDays("")).toHaveProperty("error");
  });
});

describe("parseLeadMinutes", () => {
  test("sorts descending and de-duplicates", () => {
    expect(parseLeadMinutes("5,10,5")).toEqual([10, 5]);
    expect(parseLeadMinutes("30 10 5")).toEqual([30, 10, 5]);
  });

  test("rejects out-of-range values", () => {
    expect(parseLeadMinutes("9999")).toHaveProperty("error");
    expect(parseLeadMinutes("abc")).toHaveProperty("error");
  });
});
