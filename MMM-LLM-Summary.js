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
    regenerateInterval: 1000 * 60 * 10,  // regenerate every 10 min
    cacheTTL: 1000 * 60 * 5,             // cache for 5 min
    collectDelay: 10000,                   // wait 10s after start for modules to load

    // Data sources — CSS selectors or module names to scrape
    modules: [
      // { name: "clock", selector: ".clock" },
      // { name: "weather", selector: ".weather" },
    ],

    // Display
    showModel: false,
    showTimestamp: true,
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

    var self = this;

    // Wait for other modules to render, then collect and generate
    setTimeout(function () {
      self.collectAndGenerate();
    }, this.config.collectDelay);

    // Regenerate on interval
    setInterval(function () {
      self.collectAndGenerate();
    }, this.config.regenerateInterval);
  },

  collectAndGenerate: function () {
    var moduleData = this.collectModuleData();
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
    });
  },

  collectModuleData: function () {
    var data = {};

    for (var i = 0; i < this.config.modules.length; i++) {
      var mod = this.config.modules[i];
      var selector = mod.selector || "." + mod.name;
      var el = document.querySelector(selector);
      if (el) {
        // Get text content, collapse whitespace
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
    return '<i class="fa fa-magic"></i> ' + (this.data.header || "AI Summary");
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
    if (
      this.config.maxDisplayLength &&
      displayText.length > this.config.maxDisplayLength
    ) {
      displayText =
        displayText.substring(0, this.config.maxDisplayLength) + "...";
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
