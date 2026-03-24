/**
 * @jest-environment jsdom
 */

// Minimal MagicMirror globals expected by Module.register
global.Module = {
  register: function (_name, definition) {
    global._moduleDefinition = definition;
  },
};
global.Log = { log: jest.fn() };

require("./MMM-LLM-Summary.js");

function createModule(configOverrides) {
  var def = global._moduleDefinition;
  var mod = Object.assign(Object.create(def), {
    config: Object.assign({}, def.defaults, configOverrides),
    data: { header: "AI Summary" },
    summary: null,
    error: null,
    loaded: false,
    paused: false,
    file: function (f) { return f; },
    updateDom: jest.fn(),
    sendSocketNotification: jest.fn(),
  });
  return mod;
}

// ============================================================
// formatTime
// ============================================================

describe("formatTime", () => {
  var mod;
  beforeEach(() => { mod = createModule(); });

  it("returns 'just now' for timestamps < 1 min ago", () => {
    var iso = new Date(Date.now() - 30000).toISOString();
    expect(mod.formatTime(iso)).toBe("just now");
  });

  it("returns minutes for timestamps < 60 min ago", () => {
    var iso = new Date(Date.now() - 5 * 60000).toISOString();
    expect(mod.formatTime(iso)).toBe("5 min ago");
  });

  it("returns hours for timestamps >= 60 min ago", () => {
    var iso = new Date(Date.now() - 90 * 60000).toISOString();
    expect(mod.formatTime(iso)).toBe("1 hr ago");
  });

  it("returns empty string for falsy input", () => {
    expect(mod.formatTime("")).toBe("");
    expect(mod.formatTime(null)).toBe("");
    expect(mod.formatTime(undefined)).toBe("");
  });
});

// ============================================================
// getDom — timestamp data attribute
// ============================================================

describe("getDom timestamp element", () => {
  var mod;
  beforeEach(() => {
    mod = createModule({ showTimestamp: true });
    mod.loaded = true;
    mod.summary = {
      text: "Test summary",
      model: "gpt-4o-mini",
      generatedAt: new Date(Date.now() - 15000).toISOString(),
      tokens: 42,
      cacheHit: false,
    };
  });

  it("renders a .llm-time span with data-generated-at attribute", () => {
    var dom = mod.getDom();
    var timeEl = dom.querySelector(".llm-time");
    expect(timeEl).not.toBeNull();
    expect(timeEl.dataset.generatedAt).toBe(mod.summary.generatedAt);
  });

  it("displays initial relative time text", () => {
    var dom = mod.getDom();
    var timeEl = dom.querySelector(".llm-time");
    expect(timeEl.textContent).toBe("just now");
  });
});

// ============================================================
// refreshTimes — regression test for live timestamp updates
// ============================================================

describe("refreshTimes", () => {
  var mod;
  var generatedAt;

  beforeEach(() => {
    jest.useFakeTimers();

    generatedAt = new Date(Date.now() - 10000).toISOString(); // 10s ago
    mod = createModule({ showTimestamp: true });
    mod.loaded = true;
    mod.summary = {
      text: "Summary text",
      model: "gpt-4o-mini",
      generatedAt: generatedAt,
      tokens: 10,
      cacheHit: false,
    };

    // Mount the DOM so querySelectorAll can find elements
    var dom = mod.getDom();
    document.body.innerHTML = "";
    document.body.appendChild(dom);
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("updates 'just now' to '1 min ago' after time passes", () => {
    var timeEl = document.querySelector(".llm-time");
    expect(timeEl.textContent).toBe("just now");

    // Advance clock by 2 minutes
    jest.advanceTimersByTime(2 * 60000);

    mod.refreshTimes();

    timeEl = document.querySelector(".llm-time");
    expect(timeEl.textContent).toBe("2 min ago");
  });

  it("updates to hour-based display after 60+ minutes", () => {
    jest.advanceTimersByTime(65 * 60000);
    mod.refreshTimes();

    var timeEl = document.querySelector(".llm-time");
    expect(timeEl.textContent).toBe("1 hr ago");
  });

  it("progressively updates through multiple refresh cycles", () => {
    var timeEl = document.querySelector(".llm-time");
    expect(timeEl.textContent).toBe("just now");

    // +1 min
    jest.advanceTimersByTime(60000);
    mod.refreshTimes();
    expect(timeEl.textContent).toBe("1 min ago");

    // +4 more min (total 5)
    jest.advanceTimersByTime(4 * 60000);
    mod.refreshTimes();
    expect(timeEl.textContent).toBe("5 min ago");

    // +55 more min (total 60)
    jest.advanceTimersByTime(55 * 60000);
    mod.refreshTimes();
    expect(timeEl.textContent).toBe("1 hr ago");
  });

  it("does nothing when no .llm-time elements exist", () => {
    document.body.innerHTML = "<div class='llm-summary'>no time here</div>";
    expect(() => mod.refreshTimes()).not.toThrow();
  });
});
