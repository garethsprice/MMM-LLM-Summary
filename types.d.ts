/** Module configuration options */
interface LLMSummaryConfig {
  /** API key for your LLM provider */
  apiKey: string;
  /** Provider endpoint (e.g. "https://api.openai.com/v1") */
  baseURL: string;
  /** Model name (e.g. "gpt-4o-mini", "claude-haiku-4-5-20251001") */
  model: string;
  /** Max response tokens */
  maxTokens: number;
  /** Response creativity (0-1) */
  temperature: number;

  /** System prompt override — empty uses built-in default */
  systemPrompt: string;
  /** User prompt appended after module data — empty uses built-in default */
  userPrompt: string;

  /** Baseline regeneration interval in ms (default: 3600000 / 60 min) */
  regenerateInterval: number;
  /** Interval after data changes in ms (default: 900000 / 15 min) */
  fastRegenerateInterval: number;
  /** Cache duration in ms (default: 300000 / 5 min) */
  cacheTTL: number;
  /** Wait for other modules to render before first collect in ms */
  collectDelay: number;

  /** Hour to pause generation (24h format, e.g. 22). null to disable */
  quietHoursStart: number | null;
  /** Hour to resume generation (e.g. 8). null to disable */
  quietHoursEnd: number | null;

  /** Modules to scrape for LLM context */
  modules: ModuleSource[];

  /** Show model name in footer */
  showModel: boolean;
  /** Show when summary was generated */
  showTimestamp: boolean;
  /** Show "cached" when serving cached response */
  showTokenSavings: boolean;
  /** Truncate displayed summary text */
  maxDisplayLength: number;
}

/** A module to scrape text from */
interface ModuleSource {
  /** Label sent to the LLM (e.g. "Weather") */
  name: string;
  /** CSS selector to find the module DOM element. Defaults to ".{name}" */
  selector?: string;
  /** Truncate scraped text to this many characters */
  maxLength?: number;
}

/** Collected text data from dashboard modules, keyed by module name */
interface ModuleData {
  [moduleName: string]: string;
}

/** Result returned from LLM generation */
interface SummaryResult {
  /** The generated summary text */
  text: string;
  /** Model used for generation */
  model: string;
  /** ISO 8601 timestamp of when the summary was generated */
  generatedAt: string;
  /** Total tokens used (input + output), null if unavailable */
  tokens: number | null;
  /** Whether this result was served from cache */
  cacheHit: boolean;
}

/** Payload sent from frontend to node_helper via GENERATE_SUMMARY */
interface GenerateSummaryPayload {
  config: Pick<
    LLMSummaryConfig,
    | "apiKey"
    | "baseURL"
    | "model"
    | "maxTokens"
    | "temperature"
    | "systemPrompt"
    | "userPrompt"
    | "cacheTTL"
  >;
  moduleData: ModuleData;
  previousData: ModuleData | null;
}

/** MagicMirror node_helper base interface */
interface NodeHelper {
  name: string;
  path: string;
  sendSocketNotification(notification: string, payload: unknown): void;
  socketNotificationReceived(notification: string, payload: unknown): void;
  start(): void;
}

/** MagicMirror Module.register interface (frontend) */
interface MagicMirrorModule {
  name: string;
  data: { header?: string };
  config: LLMSummaryConfig;
  sendSocketNotification(notification: string, payload: unknown): void;
  updateDom(speed: number): void;
  file(path: string): string;
}
