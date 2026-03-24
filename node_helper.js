const NodeHelper = require("node_helper");
let OpenAI;

module.exports = NodeHelper.create({
  start: function () {
    this.client = null;
    this.cache = null;
    this.cacheExpiry = 0;
    this.lastModuleData = null;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "GENERATE_SUMMARY") {
      this.generateSummary(payload.config, payload.moduleData);
    }
  },

  ensureClient: function (config) {
    if (!this.client) {
      // Lazy-load openai to avoid blocking startup
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

  generateSummary: async function (config, moduleData) {
    console.log("[MMM-LLM-Summary] Generating summary with " + config.model + " via " + config.baseURL);
    // Check cache — return cached if data hasn't changed and cache is fresh
    var dataHash = JSON.stringify(moduleData);
    if (
      this.cache &&
      Date.now() < this.cacheExpiry &&
      this.lastModuleData === dataHash
    ) {
      this.sendSocketNotification("SUMMARY_RESULT", this.cache);
      return;
    }

    try {
      var client = this.ensureClient(config);

      // Build the prompt with module data
      var systemPrompt = config.systemPrompt || "You are a concise dashboard assistant. Summarize the following dashboard data in a brief, helpful way for someone glancing at a wall-mounted display. Be conversational but brief. Use no more than 2-3 sentences.";

      var userContent = "Here is the current data from my dashboard modules:\n\n";
      for (var key in moduleData) {
        if (moduleData[key]) {
          userContent += "--- " + key + " ---\n" + moduleData[key] + "\n\n";
        }
      }
      userContent += (config.userPrompt || "Give me a brief summary of what's happening on my dashboard right now.");

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
      };

      this.cache = result;
      this.cacheExpiry = Date.now() + (config.cacheTTL || 300000);
      this.lastModuleData = dataHash;

      this.sendSocketNotification("SUMMARY_RESULT", result);
    } catch (err) {
      console.error("[MMM-LLM-Summary] Error:", err.message, err.status || "", err.error || "");
      this.sendSocketNotification("SUMMARY_ERROR", err.message);
    }
  },
});
