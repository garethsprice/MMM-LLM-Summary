const helper = require("./node_helper");

// Mock openai
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "Test summary response" } }],
          usage: { total_tokens: 42 },
        }),
      },
    },
  }));
});

beforeEach(() => {
  helper.start();
  helper.sendSocketNotification.mockClear();
});

// ============================================================
// 1. Unit tests — pure functions
// ============================================================

describe("normalizeForHash", () => {
  it("strips relative time phrases", () => {
    var data = { Weather: "Sunny 72F updated 5 min ago" };
    var result = helper.normalizeForHash(data);
    expect(result).not.toContain("5 min ago");
    expect(result).toContain("Sunny 72F");
  });

  it("strips 'just now'", () => {
    var data = { PR: "New PR opened just now" };
    var result = helper.normalizeForHash(data);
    expect(result).not.toContain("just now");
    expect(result).toContain("New PR opened");
  });

  it("strips ISO timestamps", () => {
    var data = { Search: "Query at 2026-03-23T14:30:00Z" };
    var result = helper.normalizeForHash(data);
    expect(result).not.toContain("2026-03-23");
  });

  it("strips clock times", () => {
    var data = { Clock: "3:45 PM Eastern" };
    var result = helper.normalizeForHash(data);
    expect(result).not.toContain("3:45 PM");
    expect(result).toContain("Eastern");
  });

  it("strips hour-based times", () => {
    var data = { PR: "merged 2 hr ago" };
    var result = helper.normalizeForHash(data);
    expect(result).not.toContain("2 hr ago");
  });

  it("strips day-based times", () => {
    var data = { PR: "opened 5 days ago" };
    var result = helper.normalizeForHash(data);
    expect(result).not.toContain("5 days ago");
  });

  it("produces identical hashes when only timestamps differ", () => {
    var data1 = { Weather: "Sunny 72F", PR: "Fix bug · gareth · 2 min ago" };
    var data2 = { Weather: "Sunny 72F", PR: "Fix bug · gareth · 15 min ago" };
    expect(helper.normalizeForHash(data1)).toBe(helper.normalizeForHash(data2));
  });

  it("produces different hashes when real content differs", () => {
    var data1 = { Weather: "Sunny 72F" };
    var data2 = { Weather: "Rainy 55F" };
    expect(helper.normalizeForHash(data1)).not.toBe(
      helper.normalizeForHash(data2)
    );
  });
});

describe("buildUserContent", () => {
  describe("without previous data (first call)", () => {
    it("includes all module data", () => {
      var data = { Weather: "Sunny 72F", PRs: "3 open PRs" };
      var result = helper.buildUserContent(data, null, null);
      expect(result).toContain("--- Weather ---");
      expect(result).toContain("Sunny 72F");
      expect(result).toContain("--- PRs ---");
      expect(result).toContain("3 open PRs");
    });

    it("uses default prompt when none provided", () => {
      var result = helper.buildUserContent({ A: "data" }, null, null);
      expect(result).toContain("brief summary");
    });

    it("uses custom prompt when provided", () => {
      var result = helper.buildUserContent(
        { A: "data" },
        null,
        "Custom prompt here"
      );
      expect(result).toContain("Custom prompt here");
    });

    it("skips modules with empty data", () => {
      var data = { Weather: "Sunny", Empty: "", PRs: "2 open" };
      var result = helper.buildUserContent(data, null, null);
      expect(result).toContain("--- Weather ---");
      expect(result).toContain("--- PRs ---");
      expect(result).not.toContain("--- Empty ---");
    });
  });

  describe("with previous data (diff mode)", () => {
    it("marks changed modules as updated", () => {
      var prev = { Weather: "Sunny 72F", PRs: "3 open" };
      var curr = { Weather: "Rainy 55F", PRs: "3 open" };
      var result = helper.buildUserContent(curr, prev, null);
      expect(result).toContain("Weather (updated)");
      expect(result).toContain("Rainy 55F");
    });

    it("marks new modules", () => {
      var prev = { Weather: "Sunny 72F" };
      var curr = { Weather: "Sunny 72F", PRs: "3 open" };
      var result = helper.buildUserContent(curr, prev, null);
      expect(result).toContain("PRs (new)");
    });

    it("lists unchanged modules by name only", () => {
      var prev = { Weather: "Sunny 72F", PRs: "3 open" };
      var curr = { Weather: "Sunny 72F", PRs: "5 open" };
      var result = helper.buildUserContent(curr, prev, null);
      expect(result).toContain("Unchanged: Weather");
      expect(result).not.toContain("--- Weather ---");
    });

    it("reports unchanged when nothing meaningful changed", () => {
      var prev = { Weather: "Sunny 72F" };
      var curr = { Weather: "Sunny 72F" };
      var result = helper.buildUserContent(curr, prev, null);
      expect(result).toContain("unchanged from the previous check");
    });

    it("treats timestamp-only changes as unchanged", () => {
      var prev = { PRs: "Fix bug · gareth · 2 min ago" };
      var curr = { PRs: "Fix bug · gareth · 5 min ago" };
      var result = helper.buildUserContent(curr, prev, null);
      expect(result).toContain("unchanged from the previous check");
    });
  });
});

// ============================================================
// 2. Integration tests — socket notification flow
// ============================================================

describe("socket notification flow", () => {
  var baseConfig = {
    apiKey: "test-key",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 150,
    temperature: 0.7,
    cacheTTL: 300000,
  };

  it("generates summary and sends SUMMARY_RESULT", async () => {
    await helper.generateSummary(
      baseConfig,
      { Weather: "Sunny 72F" },
      null
    );

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SUMMARY_RESULT",
      expect.objectContaining({
        text: "Test summary response",
        model: "gpt-4o-mini",
        tokens: 42,
        cacheHit: false,
      })
    );
  });

  it("returns cached result when data unchanged", async () => {
    var data = { Weather: "Sunny 72F" };

    // First call — generates
    await helper.generateSummary(baseConfig, data, null);
    helper.sendSocketNotification.mockClear();

    // Second call — same data, should cache
    await helper.generateSummary(baseConfig, data, null);

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SUMMARY_RESULT",
      expect.objectContaining({ cacheHit: true })
    );
  });

  it("regenerates when data meaningfully changes", async () => {
    await helper.generateSummary(
      baseConfig,
      { Weather: "Sunny 72F" },
      null
    );
    helper.sendSocketNotification.mockClear();

    await helper.generateSummary(
      baseConfig,
      { Weather: "Rainy 55F" },
      null
    );

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SUMMARY_RESULT",
      expect.objectContaining({ cacheHit: false })
    );
  });

  it("serves cache when only timestamps changed", async () => {
    await helper.generateSummary(
      baseConfig,
      { PRs: "Fix bug · gareth · 2 min ago" },
      null
    );
    helper.sendSocketNotification.mockClear();

    await helper.generateSummary(
      baseConfig,
      { PRs: "Fix bug · gareth · 8 min ago" },
      null
    );

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SUMMARY_RESULT",
      expect.objectContaining({ cacheHit: true })
    );
  });

  it("regenerates after cache expires", async () => {
    var shortCacheConfig = Object.assign({}, baseConfig, { cacheTTL: 1 });

    await helper.generateSummary(
      shortCacheConfig,
      { Weather: "Sunny" },
      null
    );
    helper.sendSocketNotification.mockClear();

    // Wait for cache to expire
    await new Promise((r) => setTimeout(r, 10));

    await helper.generateSummary(
      shortCacheConfig,
      { Weather: "Sunny" },
      null
    );

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SUMMARY_RESULT",
      expect.objectContaining({ cacheHit: false })
    );
  });

  it("sends SUMMARY_ERROR on API failure", async () => {
    // Override the mock to throw
    var OpenAIMock = require("openai");
    var mockInstance = new OpenAIMock();
    mockInstance.chat.completions.create.mockRejectedValueOnce(
      new Error("API rate limit exceeded")
    );
    helper.client = mockInstance;

    // Need fresh hash to bypass cache
    await helper.generateSummary(
      baseConfig,
      { Unique: "data-" + Date.now() },
      null
    );

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      "SUMMARY_ERROR",
      "API rate limit exceeded"
    );
  });

  it("dispatches via socketNotificationReceived", async () => {
    var spy = jest.spyOn(helper, "generateSummary").mockResolvedValue();

    helper.socketNotificationReceived("GENERATE_SUMMARY", {
      config: baseConfig,
      moduleData: { Weather: "Sunny" },
      previousData: null,
    });

    expect(spy).toHaveBeenCalledWith(
      baseConfig,
      { Weather: "Sunny" },
      null
    );

    spy.mockRestore();
  });

  it("ignores unknown notifications", () => {
    var spy = jest.spyOn(helper, "generateSummary");

    helper.socketNotificationReceived("UNKNOWN_EVENT", {});

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
