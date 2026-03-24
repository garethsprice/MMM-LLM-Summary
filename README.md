# MMM-LLM-Summary

A [MagicMirror²](https://magicmirror.builders/) module that uses an LLM to summarize other modules on your dashboard. Reads text content from configured modules and generates a brief AI summary.

Supports any OpenAI-compatible API — OpenAI, Anthropic, Ollama, LM Studio, and more.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/garethsprice/MMM-LLM-Summary.git
cd MMM-LLM-Summary
npm install --production
```

## Configuration

```javascript
{
  module: "MMM-LLM-Summary",
  position: "top_right",
  header: "AI Dashboard Summary",
  config: {
    apiKey: "your-api-key",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 200,
    temperature: 0.7,
    regenerateInterval: 600000,   // regenerate every 10 min
    cacheTTL: 300000,             // cache for 5 min
    collectDelay: 15000,          // wait 15s for modules to load
    showModel: true,
    showTimestamp: true,
    systemPrompt: "Summarize this dashboard briefly in 2-3 sentences.",
    modules: [
      { name: "Weather", selector: ".weather" },
      { name: "Calendar", selector: ".calendar" },
      { name: "News", selector: ".newsfeed", maxLength: 1000 },
    ],
  },
}
```

### Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | `""` | API key for your LLM provider |
| `baseURL` | `https://api.openai.com/v1` | Provider endpoint |
| `model` | `gpt-4o-mini` | Model name |
| `maxTokens` | `150` | Max response tokens |
| `temperature` | `0.7` | Response creativity (0-1) |
| `systemPrompt` | *(built-in)* | System prompt override |
| `userPrompt` | *(built-in)* | User prompt appended after module data |
| `regenerateInterval` | `600000` (10 min) | How often to call the LLM |
| `cacheTTL` | `300000` (5 min) | Cache duration — skips LLM call if data unchanged |
| `collectDelay` | `10000` (10s) | Wait for other modules to render before first collect |
| `modules` | `[]` | Modules to scrape (see below) |
| `showModel` | `false` | Show model name in footer |
| `showTimestamp` | `true` | Show when summary was generated |
| `maxDisplayLength` | `500` | Truncate displayed summary text |

### Module Sources

Each entry in `modules` tells the LLM what to read:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Label sent to the LLM (e.g. "Weather") |
| `selector` | No | CSS selector to find the module DOM element. Defaults to `.{name}` |
| `maxLength` | No | Truncate scraped text to this many characters |

### Provider Examples

| Provider | `baseURL` | `model` |
|----------|-----------|---------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini`, `gpt-4.1-nano` |
| Anthropic | `https://api.anthropic.com/v1/` | `claude-haiku-4-5-20251001` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio | `http://localhost:1234/v1` | `local-model` |

## How It Works

1. After `collectDelay`, the frontend module scrapes text content from each configured module's DOM element
2. The collected text is sent to `node_helper.js` via socket notification (API key stays server-side)
3. `node_helper.js` calls the LLM with the system prompt + module data + user prompt
4. The response is cached for `cacheTTL` — if module data hasn't changed, the cached response is returned
5. Every `regenerateInterval`, the cycle repeats
6. The summary and metadata (model, token count, timestamp) are displayed

## Tips

- Use `maxLength` on verbose modules to keep token usage down
- Set `collectDelay` high enough for all modules to fetch their data first
- For local LLMs, point `baseURL` at your Ollama/LM Studio instance — no API key needed
- The `systemPrompt` is the best lever for controlling output style and length
- Add `"Do not use emojis."` to the system prompt if your display lacks emoji fonts
