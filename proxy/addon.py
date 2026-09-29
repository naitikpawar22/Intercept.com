import asyncio
import json
import logging
import base64
import time
from typing import Dict, Any, Optional
from mitmproxy import ctx, http

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("NetScopeAddon")

class NetScopeAddon:
    def __init__(self):
        self.auth_token = ""
        self.control_port = 54321
        self.ws = None
        self.connected = False
        self.reconnect_task = None
        
        # Intercept configurations
        self.intercept_requests = False
        self.intercept_responses = False
        self.strict_scope = False
        self.scope_domains = []
        self.intercept_rules = {
            "methods": ["GET", "POST", "PUT", "DELETE", "PATCH"],
            "ignore_extensions": ["css", "js", "png", "jpg", "jpeg", "gif", "svg", "woff", "woff2", "ico", "ttf"],
            "url_pattern": ""
        }
        
        # Automatic Response Rules & Auto Mode
        self.auto_response_rules = []
        self.auto_mode_enabled = False
        self.auto_mode_target_host = ""
        self.auto_mode_match_status = 401
        self.auto_mode_replace_status = 200

        # Pending flows waiting for user action
        self.pending_requests: Dict[str, Dict[str, Any]] = {}
        self.pending_responses: Dict[str, Dict[str, Any]] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def load(self, loader):
        loader.add_option(
            name="auth_token",
            typespec=str,
            default="",
            help="Authentication token for NetScope IPC"
        )
        loader.add_option(
            name="control_port",
            typespec=int,
            default=54321,
            help="Port of NetScope Electron IPC WebSocket server"
        )

    def running(self):
        self.auth_token = ctx.options.auth_token
        self.control_port = ctx.options.control_port
        self.loop = asyncio.get_event_loop()
        logger.info(f"NetScope mitmproxy addon initialized. Connecting to control port {self.control_port}...")
        self.reconnect_task = asyncio.create_task(self._maintain_connection())

    async def _maintain_connection(self):
        import websockets
        while True:
            try:
                uri = f"ws://127.0.0.1:{self.control_port}/mitm-ipc?token={self.auth_token}"
                async with websockets.connect(uri) as websocket:
                    self.ws = websocket
                    self.connected = True
                    logger.info("Successfully connected to NetScope Electron IPC")
                    # Send ready handshake
                    await self._send_ipc({
                        "type": "handshake",
                        "status": "ready",
                        "proxy_port": ctx.options.listen_port if hasattr(ctx.options, "listen_port") else 8080
                    })
                    
                    async for message in websocket:
                        try:
                            data = json.loads(message)
                            await self._handle_ipc_message(data)
                        except Exception as e:
                            logger.error(f"Error handling IPC message: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.connected = False
                self.ws = None
                await asyncio.sleep(1.5)

    async def _send_ipc(self, data: Dict[str, Any]):
        if self.ws and self.connected:
            try:
                await self.ws.send(json.dumps(data))
            except Exception as e:
                logger.error(f"Failed to send IPC message: {e}")

    async def _handle_ipc_message(self, data: Dict[str, Any]):
        msg_type = data.get("type")
        
        if msg_type == "set_config":
            config = data.get("config", {})
            self.intercept_requests = config.get("intercept_requests", self.intercept_requests)
            self.intercept_responses = config.get("intercept_responses", self.intercept_responses)
            self.strict_scope = config.get("strict_scope", self.strict_scope)
            self.scope_domains = config.get("scope_domains", self.scope_domains)
            if "intercept_rules" in config:
                self.intercept_rules.update(config["intercept_rules"])
            if "auto_response_rules" in config:
                self.auto_response_rules = config["auto_response_rules"]
            if "auto_mode" in config:
                am = config["auto_mode"]
                self.auto_mode_enabled = am.get("enabled", False)
                self.auto_mode_target_host = am.get("target_host", "")
                self.auto_mode_match_status = int(am.get("match_status", 401))
                self.auto_mode_replace_status = int(am.get("replace_status", 200))
            logger.info(f"Updated proxy config: intercept_req={self.intercept_requests}, intercept_res={self.intercept_responses}, auto_mode={self.auto_mode_enabled}")

        elif msg_type == "action_request":
            flow_id = data.get("flow_id")
            action = data.get("action")  # 'forward', 'drop', 'forward_original'
            modifications = data.get("modifications", {})
            
            if flow_id in self.pending_requests:
                entry = self.pending_requests[flow_id]
                entry["action"] = action
                entry["modifications"] = modifications
                entry["event"].set()

        elif msg_type == "action_response":
            flow_id = data.get("flow_id")
            action = data.get("action")  # 'forward', 'drop', 'forward_original'
            modifications = data.get("modifications", {})
            
            if flow_id in self.pending_responses:
                entry = self.pending_responses[flow_id]
                entry["action"] = action
                entry["modifications"] = modifications
                entry["event"].set()

    def _is_in_scope(self, host: str) -> bool:
        if not self.scope_domains:
            return True
        for pattern in self.scope_domains:
            pattern = pattern.strip().lower()
            if not pattern:
                continue
            if pattern == "*" or pattern == host.lower():
                return True
            if pattern.startswith("*."):
                suffix = pattern[1:].lower()
                if host.lower().endswith(suffix) or host.lower() == pattern[2:].lower():
                    return True
            if pattern in host.lower():
                return True
        return False

    def _should_intercept_request(self, flow: http.HTTPFlow) -> bool:
        if not self.intercept_requests:
            return False
            
        req = flow.request
        # Scope check
        if self.strict_scope and not self._is_in_scope(req.host):
            return False

        # Method check
        allowed_methods = self.intercept_rules.get("methods", [])
        if allowed_methods and req.method.upper() not in allowed_methods:
            return False

        # Extension check
        path = req.path.split("?")[0].lower()
        ignore_exts = self.intercept_rules.get("ignore_extensions", [])
        for ext in ignore_exts:
            if path.endswith(f".{ext}"):
                return False

        # URL pattern check
        pattern = self.intercept_rules.get("url_pattern", "")
        if pattern and pattern not in req.url:
            return False

        return True

    async def request(self, flow: http.HTTPFlow):
        # Attach start timestamp for duration tracking
        flow.metadata["netscope_start_time"] = time.time()
        
        # Strict scope check: if enabled and out of scope, can block
        if self.strict_scope and not self._is_in_scope(flow.request.host):
            flow.response = http.Response.make(
                403,
                b"Request blocked: Out of authorized NetScope target scope.",
                {"Content-Type": "text/plain", "X-NetScope-Blocked": "Strict-Scope"}
            )
            return

        if self._should_intercept_request(flow):
            event = asyncio.Event()
            self.pending_requests[flow.id] = {
                "flow": flow,
                "event": event,
                "action": "forward_original",
                "modifications": {}
            }

            # Prepare request payload for Electron
            req = flow.request
            body_text = ""
            body_b64 = ""
            is_binary = False

            try:
                body_text = req.get_text()
            except Exception:
                is_binary = True
                if req.raw_content:
                    body_b64 = base64.b64encode(req.raw_content).decode("ascii")

            headers_dict = dict(req.headers.items())
            
            await self._send_ipc({
                "type": "intercepted_request",
                "flow_id": flow.id,
                "method": req.method,
                "url": req.url,
                "domain": req.host,
                "path": req.path,
                "headers": headers_dict,
                "body_text": body_text,
                "body_b64": body_b64,
                "is_binary": is_binary,
                "content_type": req.headers.get("content-type", ""),
                "timestamp": int(time.time() * 1000)
            })

            # Wait for user decision with safety timeout
            try:
                await asyncio.wait_for(event.wait(), timeout=120.0)
            except asyncio.TimeoutError:
                logger.warning(f"Intercept timeout for request {flow.id}, auto-forwarding original.")
                self.pending_requests.pop(flow.id, None)
                return

            action_info = self.pending_requests.pop(flow.id, None)
            if not action_info:
                return

            action = action_info.get("action")
            if action == "drop":
                flow.kill()
                return

            if action == "forward":
                mods = action_info.get("modifications", {})
                if "method" in mods:
                    flow.request.method = mods["method"]
                if "url" in mods:
                    flow.request.url = mods["url"]
                if "headers" in mods:
                    flow.request.headers.clear()
                    for k, v in mods["headers"].items():
                        flow.request.headers[k] = str(v)
                if "body_text" in mods:
                    new_body = mods["body_text"].encode("utf-8")
                    flow.request.raw_content = new_body
                    flow.request.headers["Content-Length"] = str(len(new_body))
                elif "body_b64" in mods and mods["body_b64"]:
                    new_body = base64.b64decode(mods["body_b64"])
                    flow.request.raw_content = new_body
                    flow.request.headers["Content-Length"] = str(len(new_body))

    async def response(self, flow: http.HTTPFlow):
        if not flow.response:
            return

        res = flow.response
        req = flow.request
        start_time = flow.metadata.get("netscope_start_time", time.time())
        duration_ms = int((time.time() - start_time) * 1000)

        # Check Automatic Response Rules & Auto Mode
        matched_rule = None

        # 1. Global Auto Mode check (e.g., 401 -> 200 for target testing environment)
        if self.auto_mode_enabled and res.status_code == self.auto_mode_match_status:
            target = (self.auto_mode_target_host or "").strip().lower()
            host = req.host.lower()
            # Strict protection: Only apply to explicitly configured authorized target host / test environment
            if target and target != "*":
                if target == host or (target.startswith("*.") and host.endswith(target[1:])) or target in host or host in target:
                    matched_rule = {
                        "name": f"Auto Mode ({self.auto_mode_match_status} -> {self.auto_mode_replace_status})",
                        "replace_status": self.auto_mode_replace_status,
                        "replace_body": None
                    }

        # 2. Configured Automatic Rules check
        if not matched_rule and self.auto_response_rules:
            for rule in self.auto_response_rules:
                if not rule.get("enabled", True):
                    continue
                match_status = rule.get("match_status")
                if match_status is not None and int(match_status) != res.status_code:
                    continue
                rule_method = (rule.get("method") or "ALL").upper()
                if rule_method != "ALL" and rule_method != req.method.upper():
                    continue
                rule_host = (rule.get("target_host") or "").strip().lower()
                host = req.host.lower()
                # Strict check: rule_host must be explicitly configured and not a global wildcard
                if not rule_host or rule_host == "*":
                    continue
                if rule_host != host and not (rule_host.startswith("*.") and host.endswith(rule_host[1:])) and rule_host not in host and host not in rule_host:
                    continue
                matched_rule = rule
                break

        if matched_rule:
            # Auto-modify and forward without blocking
            try:
                flow.response.decode()
            except Exception:
                pass

            orig_status = res.status_code
            new_status = int(matched_rule.get("replace_status", 200))
            flow.response.status_code = new_status

            for h in list(flow.response.headers.keys()):
                if h.lower() in ("content-encoding", "transfer-encoding", "etag", "content-md5", "content-length"):
                    del flow.response.headers[h]

            replace_body = matched_rule.get("replace_body")
            if replace_body is not None and replace_body != "":
                try:
                    flow.response.set_text(replace_body)
                except Exception:
                    new_body = replace_body.encode("utf-8")
                    flow.response.content = new_body
                    flow.response.headers["Content-Length"] = str(len(new_body))
            else:
                try:
                    current_text = flow.response.get_text()
                    # Auto-convert statusCode: 401 to 200 in JSON body when status is rewritten to 200
                    if new_status == 200 and orig_status == 401:
                        import re
                        current_text = re.sub(r'("statusCode"\s*:\s*)401', r'\g<1>200', current_text)
                        current_text = re.sub(r'("status"\s*:\s*)401', r'\g<1>200', current_text)
                        current_text = re.sub(r'("code"\s*:\s*)401', r'\g<1>200', current_text)
                    flow.response.set_text(current_text)
                except Exception:
                    if flow.response.content:
                        flow.response.headers["Content-Length"] = str(len(flow.response.content))

            await self._send_ipc({
                "type": "response_auto_modified",
                "flow_id": flow.id,
                "url": req.url,
                "method": req.method,
                "domain": req.host,
                "path": req.path,
                "original_status": orig_status,
                "modified_status": new_status,
                "rule_name": matched_rule.get("name", "Auto Rule"),
                "duration_ms": duration_ms,
                "timestamp": int(time.time() * 1000)
            })

        # Check if response interception is enabled (manual queue)
        elif self.intercept_responses and flow.response:
            # Decompress response in-place if compressed so user sees clean plaintext and headers
            try:
                flow.response.decode()
            except Exception:
                pass

            event = asyncio.Event()
            self.pending_responses[flow.id] = {
                "flow": flow,
                "event": event,
                "action": "forward_original",
                "modifications": {}
            }

            body_text = ""
            body_b64 = ""
            is_binary = False

            try:
                body_text = res.get_text()
            except Exception:
                is_binary = True
                if res.raw_content:
                    body_b64 = base64.b64encode(res.raw_content).decode("ascii")

            await self._send_ipc({
                "type": "intercepted_response",
                "flow_id": flow.id,
                "url": req.url,
                "method": req.method,
                "domain": req.host,
                "path": req.path,
                "duration_ms": duration_ms,
                "status_code": res.status_code,
                "status_message": res.reason,
                "headers": dict(res.headers.items()),
                "body_text": body_text,
                "body_b64": body_b64,
                "is_binary": is_binary,
                "content_type": res.headers.get("content-type", ""),
                "timestamp": int(time.time() * 1000)
            })

            try:
                await asyncio.wait_for(event.wait(), timeout=120.0)
            except asyncio.TimeoutError:
                logger.warning(f"Intercept timeout for response {flow.id}, auto-forwarding original.")
                self.pending_responses.pop(flow.id, None)
            else:
                action_info = self.pending_responses.pop(flow.id, None)
                if action_info:
                    action = action_info.get("action")
                    if action == "drop":
                        flow.kill()
                        return
                    if action == "forward":
                        mods = action_info.get("modifications", {})
                        if "status_code" in mods:
                            try:
                                flow.response.status_code = int(mods["status_code"])
                            except Exception:
                                pass
                        if "headers" in mods and isinstance(mods["headers"], dict) and len(mods["headers"]) > 0:
                            flow.response.headers.clear()
                            for k, v in mods["headers"].items():
                                flow.response.headers[k] = str(v)

                        # Clean compression, chunking, and etag headers to ensure browser accepts modified response immediately
                        for h in list(flow.response.headers.keys()):
                            if h.lower() in ("content-encoding", "transfer-encoding", "etag", "content-md5", "content-length"):
                                del flow.response.headers[h]

                        if "body_text" in mods:
                            try:
                                flow.response.set_text(mods["body_text"])
                            except Exception:
                                new_body = mods["body_text"].encode("utf-8")
                                flow.response.content = new_body
                                flow.response.headers["Content-Length"] = str(len(new_body))
                        elif "body_b64" in mods and mods["body_b64"]:
                            new_body = base64.b64decode(mods["body_b64"])
                            flow.response.content = new_body
                            flow.response.headers["Content-Length"] = str(len(new_body))
                        else:
                            try:
                                text = flow.response.get_text()
                                flow.response.set_text(text)
                            except Exception:
                                if flow.response.content:
                                    flow.response.headers["Content-Length"] = str(len(flow.response.content))

        # Calculate timing
        start_time = flow.metadata.get("netscope_start_time", time.time())
        duration_ms = int((time.time() - start_time) * 1000)

        # Classify resource type
        ct = flow.response.headers.get("content-type", "").lower()
        path = flow.request.path.split("?")[0].lower()
        res_type = "Other"
        if "html" in ct or path.endswith((".html", ".htm")):
            res_type = "Document"
        elif "javascript" in ct or path.endswith((".js", ".mjs")):
            res_type = "Script"
        elif "css" in ct or path.endswith(".css"):
            res_type = "Stylesheet"
        elif any(img in ct for img in ["image", "jpeg", "png", "gif", "svg", "webp"]) or path.endswith((".png", ".jpg", ".gif", ".svg", ".ico", ".webp")):
            res_type = "Image"
        elif "font" in ct or path.endswith((".woff", ".woff2", ".ttf", ".otf")):
            res_type = "Font"
        elif any(med in ct for med in ["video", "audio"]):
            res_type = "Media"
        elif "json" in ct or flow.request.headers.get("x-requested-with") == "XMLHttpRequest":
            res_type = "Fetch"
        elif "xml" in ct:
            res_type = "XHR"

        # Prepare body preview for logging / network panel
        res_body_text = ""
        try:
            res_body_text = flow.response.get_text()
            if len(res_body_text) > 500000:
                res_body_text = res_body_text[:500000] + "... [truncated]"
        except Exception:
            res_body_text = "[Binary Content]"

        req_body_text = ""
        try:
            req_body_text = flow.request.get_text()
        except Exception:
            req_body_text = "[Binary Content]"

        # Send completed flow to Electron
        await self._send_ipc({
            "type": "flow_completed",
            "data": {
                "flow_id": flow.id,
                "method": flow.request.method,
                "url": flow.request.url,
                "domain": flow.request.host,
                "path": flow.request.path,
                "scheme": flow.request.scheme,
                "port": flow.request.port,
                "request_headers": dict(flow.request.headers.items()),
                "request_body": req_body_text,
                "status_code": flow.response.status_code,
                "status_message": flow.response.reason,
                "response_headers": dict(flow.response.headers.items()),
                "response_body": res_body_text,
                "content_type": flow.response.headers.get("content-type", ""),
                "content_length": len(flow.response.raw_content or b""),
                "duration_ms": duration_ms,
                "mime_type": ct.split(";")[0],
                "resource_type": res_type,
                "in_scope": self._is_in_scope(flow.request.host),
                "timestamp": int(time.time() * 1000)
            }
        })

    async def error(self, flow: http.HTTPFlow):
        err_msg = str(flow.error.msg) if flow.error else "Unknown network error"
        await self._send_ipc({
            "type": "flow_error",
            "flow_id": flow.id,
            "url": flow.request.url if flow.request else "unknown",
            "error": err_msg,
            "timestamp": int(time.time() * 1000)
        })

addons = [NetScopeAddon()]
