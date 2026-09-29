export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface NetworkFlow {
  id?: string;
  request_id?: string;
  response_id?: string;
  flow_id?: string;
  method: string;
  url: string;
  domain: string;
  path: string;
  scheme: string;
  port: number;
  status_code: number;
  status_message?: string;
  mime_type?: string;
  resource_type: string;
  content_length: number;
  duration_ms: number;
  request_headers: Record<string, string>;
  request_body?: string;
  response_headers: Record<string, string>;
  response_body?: string;
  in_scope?: boolean;
  timestamp: number;
}

export interface InterceptedRequest {
  flow_id: string;
  method: string;
  url: string;
  domain: string;
  path: string;
  headers: Record<string, string>;
  body_text?: string;
  body_b64?: string;
  is_binary?: boolean;
  content_type?: string;
  timestamp: number;
}

export interface InterceptedResponse {
  flow_id: string;
  url?: string;
  method?: string;
  domain?: string;
  path?: string;
  duration_ms?: number;
  status_code: number;
  status_message?: string;
  headers: Record<string, string>;
  body_text?: string;
  body_b64?: string;
  is_binary?: boolean;
  content_type?: string;
  timestamp: number;
}

export interface AutoResponseRule {
  id: string;
  name: string;
  target_host: string;
  method: string;
  match_status: number;
  replace_status: number;
  replace_body?: string;
  enabled: boolean;
  created_at?: number;
}

export interface AutoModeConfig {
  enabled: boolean;
  targetHost: string;
  matchStatus: number;
  replaceStatus: number;
}

export interface ResponseModificationLog {
  id: string;
  flow_id?: string;
  url: string;
  method: string;
  original_status: number;
  modified_status: number;
  rule_name: string;
  timestamp: number;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  controlPort: number;
  connectedToAddon: boolean;
  error?: string;
  interceptRequests: boolean;
  interceptResponses: boolean;
  strictScope: boolean;
  waitingRequestsCount: number;
  waitingResponsesCount: number;
}

export interface ScopeRule {
  id: string;
  pattern: string;
  is_regex: number;
  enabled: number;
  created_at?: string;
}

export interface RepeaterTab {
  id: string;
  title: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  last_response?: {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: string;
    durationMs: number;
    sizeBytes: number;
    error?: string;
  };
}

export interface ConsoleEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  source?: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export interface SeleniumStatus {
  running: boolean;
  launching: boolean;
  url: string;
  title: string;
  proxyPort: number;
  cdpPort: number;
  pid: number | null;
  error?: string;
}

declare global {
  interface Window {
    netscope: any;
  }
}
