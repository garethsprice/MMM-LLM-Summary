const NodeHelper = require("node_helper");
let OpenAI;

module.exports = NodeHelper.create({
  start: function () {
    this.client = null;
    this.cache = null;
    this.cacheExpiry = 0;
    this.lastNormalizedHash = null;
    this.lastModuleData = null;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "GENERATE_SUMMARY") {
      this.generateSummary(payload.config, payload.moduleData, payload.previousData);
    }
  },

  ensureClient: function (config) {
    if (!this.client) {
      if (!OpenAI) {
        OpenAI = require("openai");
      }
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
    }
    return this.client;
  },

  normalizeForHash: function (data) {
    var str = JSON.stringify(data);
    str = str.replace(/\b\d+\s*(min|hr|hour|day|days|week|weeks)\s*ago\b/gi, "");
    str = str.replace(/\bjust now\b/gi, "");
    str = str.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s"]*/g, "");
    str = str.replace(/\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)?\b/g, "");
    return str;
  },

  generateSummary: async function (config, moduleData, previousData) {
    // Normalize and check if data actually changed (ignoring timestamps)
    var normalizedHash = this.normalizeForHash(moduleData);

    // Return cache if data hasn't meaningfully changed and cache is fresh
    if (
      this.cache &&
      Date.now() < this.cacheExpiry &&
      normalizedHash === this.lastNormalizedHash
    ) {
      var cached = Object.assign({}, this.cache, { cacheHit: true });
      this.sendSocketNotification("SUMMARY_RESULT", cached);
      return;
    }

    try {
      var client = this.ensureClient(config);

      // Build system prompt (static — maximizes prefix caching on OpenAI)
      var systemPrompt = config.systemPrompt ||
        "You are a concise dashboard assistant. Summarize the following dashboard data in a brief, helpful way for someone glancing at a wall-mounted display. Be conversational but brief. Use no more than 2-3 sentences.";

      // Build user content — diff-based if we have previous data
      var userContent = this.buildUserContent(moduleData, previousData, config.userPrompt);

      var response = await client.chat.completions.create({
        model: config.model,
        max_tokens: config.maxTokens || 150,
        temperature: config.temperature || 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });

      var summary = response.choices[0].message.content;
      var result = {
        text: summary,
        model: config.model,
        generatedAt: new Date().toISOString(),
        tokens: response.usage ? response.usage.total_tokens : null,
        cacheHit: false,
      };

      this.cache = result;
      this.cacheExpiry = Date.now() + (config.cacheTTL || 300000);
      this.lastNormalizedHash = normalizedHash;
      this.lastModuleData = moduleData;

      this.sendSocketNotification("SUMMARY_RESULT", result);
    } catch (err) {
      console.error("[MMM-LLM-Summary] Error:", err.message, err.status || "", err.error || "");
      this.sendSocketNotification("SUMMARY_ERROR", err.message);
    }
  },

  buildUserContent: function (moduleData, previousData, userPrompt) {
    var prompt = userPrompt || "Give me a brief summary of what's happening on my dashboard right now. Focus on what changed or is noteworthy.";

    // If no previous data, send everything
    if (!previousData) {
      var content = "Here is the current data from my dashboard modules:\n\n";
      for (var key in moduleData) {
        if (moduleData[key]) {
          content += "--- " + key + " ---\n" + moduleData[key] + "\n\n";
        }
      }
      content += prompt;
      return content;
    }

    // Diff-based: identify what changed, what's new, what's unchanged
    var changed = [];
    var added = [];
    var unchanged = [];

    for (var modName in moduleData) {
      if (!previousData[modName]) {
        added.push({ name: modName, data: moduleData[modName] });
      } else if (this.normalizeForHash({ v: moduleData[modName] }) !== this.normalizeForHash({ v: previousData[modName] })) {
        changed.push({ name: modName, data: moduleData[modName] });
      } else {
        unchanged.push(modName);
      }
    }

    var content = "";

    if (changed.length > 0 || added.length > 0) {
      if (changed.length > 0) {
        content += "The following modules have updated data:\n\n";
        for (var i = 0; i < changed.length; i++) {
          content += "--- " + changed[i].name + " (updated) ---\n" + changed[i].data + "\n\n";
        }
      }
      if (added.length > 0) {
        content += "New module data:\n\n";
        for (var j = 0; j < added.length; j++) {
          content += "--- " + added[j].name + " (new) ---\n" + added[j].data + "\n\n";
        }
      }
      if (unchanged.length > 0) {
        content += "Unchanged: " + unchanged.join(", ") + "\n\n";
      }
    } else {
      // Nothing meaningful changed — send minimal context
      content += "Dashboard data is unchanged from the previous check. Modules active: " +
        Object.keys(moduleData).join(", ") + "\n\n";
    }

    content += prompt;
    return content;
  },
});
