import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface RepeaterRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  useProxy?: boolean;
  proxyPort?: number;
}

export interface RepeaterResponse {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  sizeBytes: number;
  error?: string;
}

export class RepeaterService {
  public static async execute(req: RepeaterRequest): Promise<RepeaterResponse> {
    const startTime = Date.now();
    let urlObj: URL;
    try {
      urlObj = new URL(req.url);
    } catch (e: any) {
      return {
        statusCode: 0,
        statusMessage: 'Invalid URL',
        headers: {},
        body: `Error parsing URL: ${e.message}`,
        durationMs: 0,
        sizeBytes: 0,
        error: e.message
      };
    }

    return new Promise((resolve) => {
      const isHttps = urlObj.protocol === 'https:';
      const bodyBuffer = req.body ? Buffer.from(req.body, 'utf-8') : Buffer.alloc(0);

      const headers: Record<string, string> = { ...req.headers };
      if (bodyBuffer.length > 0 && !headers['content-length'] && !headers['Content-Length']) {
        headers['Content-Length'] = String(bodyBuffer.length);
      }

      // If useProxy is enabled, route through local mitmproxy
      let requestOptions: any;
      let requestModule: typeof http | typeof https = isHttps ? https : http;

      if (req.useProxy && req.proxyPort) {
        // Send via HTTP proxy
        requestOptions = {
          host: '127.0.0.1',
          port: req.proxyPort,
          method: req.method,
          path: req.url, // full URL for proxy
          headers: {
            ...headers,
            Host: urlObj.host
          },
          rejectUnauthorized: false
        };
        requestModule = http;
      } else {
        requestOptions = {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          method: req.method,
          path: `${urlObj.pathname}${urlObj.search}`,
          headers,
          rejectUnauthorized: false
        };
      }

      const clientReq = requestModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          const fullBody = Buffer.concat(chunks);
          const resHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              resHeaders[k] = v.join(', ');
            } else if (v !== undefined) {
              resHeaders[k] = v;
            }
          }

          resolve({
            statusCode: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: resHeaders,
            body: fullBody.toString('utf-8'),
            durationMs,
            sizeBytes: fullBody.length
          });
        });
      });

      clientReq.on('error', (err) => {
        resolve({
          statusCode: 0,
          statusMessage: 'Connection Error',
          headers: {},
          body: `Request error: ${err.message}`,
          durationMs: Date.now() - startTime,
          sizeBytes: 0,
          error: err.message
        });
      });

      clientReq.setTimeout(30000, () => {
        clientReq.destroy(new Error('Request timed out after 30 seconds'));
      });

      if (bodyBuffer.length > 0) {
        clientReq.write(bodyBuffer);
      }
      clientReq.end();
    });
  }
}
