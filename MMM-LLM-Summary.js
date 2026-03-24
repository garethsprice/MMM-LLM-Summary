Module.register("MMM-LLM-Summary", {
  defaults: {
    // LLM provider config
    apiKey: "",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 150,
    temperature: 0.7,

    // Prompts
    systemPrompt: "",  // empty = use default
    userPrompt: "",    // empty = use default

    // Timing
    regenerateInterval: 1000 * 60 * 60,     // baseline regeneration: 60 min
    fastRegenerateInterval: 1000 * 60 * 15, // after data change: 15 min
    cacheTTL: 1000 * 60 * 5,              // cache for 5 min
    collectDelay: 10000,                    // wait 10s for modules to load

    // Quiet hours — pause generation during these hours (24h format)
    quietHoursStart: null,  // e.g. 22 for 10pm
    quietHoursEnd: null,    // e.g. 7 for 7am

    // Data sources
    modules: [],

    // Display
    showModel: false,
    showTimestamp: true,
    showTokenSavings: false,
    maxDisplayLength: 500,
  },

  getStyles: function () {
    return [this.file("MMM-LLM-Summary.css"), "font-awesome.css"];
  },

  start: function () {
    Log.log("Starting module: " + this.name);
    this.summary = null;
    this.error = null;
    this.loaded = false;
    this.lastCollectedData = null;
    this.dataChangedRecently = false;
    this.paused = false;

    var self = this;

    // Initial collect after delay
    setTimeout(function () {
      self.tick();
    }, this.config.collectDelay);

    // Adaptive interval — check every minute, decide whether to regenerate
    setInterval(function () {
      self.tick();
    }, 60000);
  },

  tick: function () {
    // Check quiet hours
    if (this.isQuietHours()) {
      if (!this.paused) {
        this.paused = true;
        this.updateDom(0);
      }
      return;
    }
    if (this.paused) {
      this.paused = false;
      // Force regeneration when coming out of quiet hours
      this.lastCollectedData = null;
    }

    var moduleData = this.collectModuleData();
    var normalizedData = this.normalizeForComparison(moduleData);
    var dataChanged = normalizedData !== this.lastNormalizedData;

    if (dataChanged) {
      this.dataChangedRecently = true;
      this.lastDataChangeTime = Date.now();
    }

    // Determine interval: fast if data changed recently, normal otherwise
    var interval = this.dataChangedRecently
      ? this.config.fastRegenerateInterval
      : this.config.regenerateInterval;

    // Check if enough time has passed since last generation
    var timeSinceLastGen = this.summary
      ? Date.now() - new Date(this.summary.generatedAt).getTime()
      : Infinity;

    // Reset fast mode after 10 minutes of no changes
    if (this.lastDataChangeTime && Date.now() - this.lastDataChangeTime > 600000) {
      this.dataChangedRecently = false;
    }

    if (timeSinceLastGen >= interval || !this.loaded) {
      this.sendSocketNotification("GENERATE_SUMMARY", {
        config: {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
          model: this.config.model,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          systemPrompt: this.config.systemPrompt,
          userPrompt: this.config.userPrompt,
          cacheTTL: this.config.cacheTTL,
        },
        moduleData: moduleData,
        previousData: this.lastCollectedData,
      });
      this.lastCollectedData = moduleData;
      this.lastNormalizedData = normalizedData;
    }
  },

  isQuietHours: function () {
    var start = this.config.quietHoursStart;
    var end = this.config.quietHoursEnd;
    if (start === null || end === null) return false;

    var hour = new Date().getHours();
    if (start < end) {
      // e.g. 22-7 doesn't apply, but 9-17 does
      return hour >= start && hour < end;
    }
    // Wraps midnight: e.g. start=22, end=7
    return hour >= start || hour < end;
  },

  normalizeForComparison: function (data) {
    // Strip relative times and timestamps to avoid false change detection
    var str = JSON.stringify(data);
    // Remove patterns like "2 min ago", "1 hr ago", "3 days ago", "just now"
    str = str.replace(/\b\d+\s*(min|hr|hour|day|days|week|weeks)\s*ago\b/gi, "");
    str = str.replace(/\bjust now\b/gi, "");
    // Remove ISO timestamps
    str = str.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s"]*/g, "");
    // Remove time strings like "3:45 PM"
    str = str.replace(/\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)?\b/g, "");
    return str;
  },

  collectModuleData: function () {
    var data = {};
    for (var i = 0; i < this.config.modules.length; i++) {
      var mod = this.config.modules[i];
      var selector = mod.selector || "." + mod.name;
      var el = document.querySelector(selector);
      if (el) {
        var text = el.innerText || el.textContent || "";
        text = text.replace(/\s+/g, " ").trim();
        if (mod.maxLength && text.length > mod.maxLength) {
          text = text.substring(0, mod.maxLength) + "...";
        }
        if (text) {
          data[mod.name] = text;
        }
      }
    }
    return data;
  },

  getHeader: function () {
    var header = '<i class="fa fa-magic"></i> ' + (this.data.header || "AI Summary");
    if (this.paused) {
      header += ' <span class="llm-paused xsmall dimmed"><i class="fa fa-moon-o"></i> paused</span>';
    }
    return header;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SUMMARY_RESULT") {
      this.summary = payload;
      this.error = null;
      this.loaded = true;
      this.updateDom(0);
    } else if (notification === "SUMMARY_ERROR") {
      this.error = payload;
      this.updateDom(0);
    }
  },

  getDom: function () {
    var wrapper = document.createElement("div");
    wrapper.className = "llm-summary";

    if (this.error) {
      wrapper.innerHTML =
        '<span class="dimmed light small">Error: ' + this.error + "</span>";
      return wrapper;
    }

    if (!this.loaded) {
      wrapper.innerHTML =
        '<span class="dimmed light small"><i class="fa fa-spinner fa-pulse"></i> Generating summary...</span>';
      return wrapper;
    }

    // Summary text
    var text = document.createElement("div");
    text.className = "llm-summary-text";
    var displayText = this.summary.text;
    if (this.config.maxDisplayLength && displayText.length > this.config.maxDisplayLength) {
      displayText = displayText.substring(0, this.config.maxDisplayLength) + "...";
    }
    text.innerHTML = displayText;
    wrapper.appendChild(text);

    // Meta line
    var meta = document.createElement("div");
    meta.className = "llm-summary-meta xsmall dimmed";
    var metaParts = [];

    if (this.config.showModel) {
      metaParts.push(this.summary.model);
    }
    if (this.summary.tokens) {
      metaParts.push(this.summary.tokens + " tokens");
    }
    if (this.config.showTokenSavings && this.summary.cacheHit) {
      metaParts.push("cached");
    }
    if (this.config.showTimestamp && this.summary.generatedAt) {
      metaParts.push(this.formatTime(this.summary.generatedAt));
    }
    if (metaParts.length > 0) {
      meta.innerHTML = metaParts.join(" · ");
      wrapper.appendChild(meta);
    }

    return wrapper;
  },

  formatTime: function (isoString) {
    if (!isoString) return "";
    var now = Date.now();
    var then = new Date(isoString).getTime();
    var diffMin = Math.floor((now - then) / 60000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return diffMin + " min ago";
    var diffHr = Math.floor(diffMin / 60);
    return diffHr + " hr ago";
  },
});
