import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path


URL = "http://127.0.0.1:8080"


def is_running():
    try:
        with urllib.request.urlopen(URL, timeout=0.4) as response:
            return response.status < 500
    except Exception:
        return False


def main():
    app_dir = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
    if is_running():
        webbrowser.open(URL)
        return

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(
        ["py", "-3", "main.py"],
        cwd=app_dir,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )
    for _ in range(40):
        if is_running():
            webbrowser.open(URL)
            return
        time.sleep(0.25)
    webbrowser.open(URL)


if __name__ == "__main__":
    main()
