import sys
import json
import os
import time
import threading
import tempfile
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import WebDriverException, NoSuchWindowException

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stdin, 'reconfigure'):
        sys.stdin.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

driver = None
running = True
last_url = ""
last_title = ""
lock = threading.Lock()

def send_json(data):
    try:
        sys.stdout.write(json.dumps(data) + "\n")
        sys.stdout.flush()
    except Exception:
        pass

def find_chrome_binary():
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None

def monitor_browser():
    global driver, running, last_url, last_title
    while running:
        time.sleep(0.5)
        if driver is not None:
            try:
                with lock:
                    if driver is None:
                        break
                    current_url = driver.current_url
                    current_title = driver.title
                    
                if current_url != last_url or current_title != last_title:
                    last_url = current_url
                    last_title = current_title
                    send_json({
                        "event": "state_changed",
                        "url": current_url,
                        "title": current_title
                    })
            except (NoSuchWindowException, WebDriverException) as e:
                send_json({"event": "browser_closed", "reason": str(e)})
                with lock:
                    driver = None
                break
            except Exception:
                pass

def launch_chrome(proxy_port=8080, cdp_port=9222, initial_url="http://127.0.0.1:4000"):
    global driver, last_url, last_title
    with lock:
        if driver is not None:
            try:
                # Check if driver is still responsive
                last_url = driver.current_url
                last_title = driver.title
                send_json({"event": "already_running", "url": last_url, "title": last_title})
                return
            except Exception:
                driver = None

        try:
            options = Options()
            chrome_bin = find_chrome_binary()
            if chrome_bin:
                options.binary_location = chrome_bin

            if proxy_port:
                options.add_argument(f"--proxy-server=http://127.0.0.1:{proxy_port}")
                options.add_argument("--proxy-bypass-list=<-loopback>")
            
            # Security testing options
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--ignore-ssl-errors=yes")
            options.add_argument("--allow-insecure-localhost")
            options.add_argument("--test-type")
            options.add_argument("--disable-web-security")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument(f"--remote-debugging-port={cdp_port}")
            options.add_argument("--no-first-run")
            options.add_argument("--no-default-browser-check")
            options.add_argument("--disable-search-engine-choice-screen")

            # Dedicated profile directory
            local_app_data = os.environ.get("LOCALAPPDATA", tempfile.gettempdir())
            profile_dir = os.path.join(local_app_data, "NetScope", "SeleniumProfile")
            os.makedirs(profile_dir, exist_ok=True)

            # Clear stale lockfile if Chrome was terminated unexpectedly
            for lock_name in ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"]:
                fpath = os.path.join(profile_dir, lock_name)
                if os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass

            options.add_argument(f"--user-data-dir={profile_dir}")

            driver = webdriver.Chrome(options=options)
            
            if initial_url:
                driver.get(initial_url)
                last_url = driver.current_url
                last_title = driver.title
            else:
                last_url = "about:blank"
                last_title = "New Tab"

            send_json({
                "event": "launched",
                "url": last_url,
                "title": last_title,
                "proxy_port": proxy_port,
                "cdp_port": cdp_port
            })

            # Start background monitor thread
            t = threading.Thread(target=monitor_browser, daemon=True)
            t.start()

        except Exception as e:
            send_json({"event": "error", "error": f"Failed to launch Chrome: {str(e)}"})
            driver = None

def navigate(url):
    global driver
    with lock:
        if driver is None:
            send_json({"event": "error", "error": "Chrome is not running"})
            return
        try:
            target = url.strip()
            if not target.startswith("http://") and not target.startswith("https://") and not target.startswith("about:"):
                target = "https://" + target
            driver.get(target)
            send_json({"event": "navigated", "url": driver.current_url, "title": driver.title})
        except Exception as e:
            send_json({"event": "error", "error": f"Navigation error: {str(e)}"})

def quit_chrome():
    global driver
    with lock:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
            driver = None
            send_json({"event": "closed"})

def focus_browser():
    global driver
    with lock:
        if driver is None:
            return
        try:
            # Switch to active window handle
            driver.switch_to.window(driver.current_window_handle)
            # Wake up any background microtasks, animations, and SPA state updates
            driver.execute_script("""
                try {
                    window.focus();
                    if (document.hidden) {
                        try {
                            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
                            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
                        } catch(e) {}
                        document.dispatchEvent(new Event('visibilitychange'));
                    }
                    window.dispatchEvent(new Event('focus'));
                } catch(e) {}
            """)
            # Bring Chrome window to foreground on Windows
            try:
                import ctypes
                title = driver.title
                hwnd = 0
                if title:
                    hwnd = ctypes.windll.user32.FindWindowW(None, title)
                if not hwnd:
                    hwnd = ctypes.windll.user32.FindWindowW("Chrome_WidgetWin_1", None)
                if hwnd:
                    ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
            except Exception:
                pass
            send_json({"event": "focused"})
        except Exception as e:
            send_json({"event": "error", "error": f"Focus error: {str(e)}"})

def main():
    global running
    send_json({"event": "ready"})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            cmd = msg.get("command")
            if cmd == "launch":
                launch_chrome(
                    proxy_port=msg.get("proxy_port", 8080),
                    cdp_port=msg.get("cdp_port", 9222),
                    initial_url=msg.get("url", "http://127.0.0.1:4000")
                )
            elif cmd == "navigate":
                navigate(msg.get("url", ""))
            elif cmd == "back":
                with lock:
                    if driver:
                        driver.back()
            elif cmd == "forward":
                with lock:
                    if driver:
                        driver.forward()
            elif cmd == "reload":
                with lock:
                    if driver:
                        driver.refresh()
            elif cmd == "focus":
                focus_browser()
            elif cmd == "status":
                with lock:
                    is_active = driver is not None
                    send_json({
                        "event": "status",
                        "running": is_active,
                        "url": last_url if is_active else "",
                        "title": last_title if is_active else ""
                    })
            elif cmd == "quit":
                quit_chrome()
                break
        except Exception as e:
            send_json({"event": "error", "error": str(e)})

    running = False
    quit_chrome()

if __name__ == "__main__":
    main()
