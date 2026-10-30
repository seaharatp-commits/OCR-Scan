"""Local EasyOCR service. It accepts images only from the OCRScan app on this PC."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import json
import threading

HOST = "127.0.0.1"
PORT = 4174
MAX_BYTES = 40 * 1024 * 1024
APP_ORIGIN = "http://127.0.0.1:4173"
MODEL_DIR = Path(__file__).resolve().parent / ".models" / "easyocr"

reader = None
startup_error = None
reader_lock = threading.Lock()


def initialize_reader():
    global reader, startup_error
    try:
        import easyocr

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        print("Loading pretrained EasyOCR models for Thai and English...", flush=True)
        reader = easyocr.Reader(
            ["th", "en"],
            gpu=False,
            model_storage_directory=str(MODEL_DIR),
            download_enabled=True,
            verbose=True,
        )
        print("EasyOCR is ready.", flush=True)
    except Exception as error:  # Keep /health available so the UI can explain setup errors.
        startup_error = f"{type(error).__name__}: {error}"
        print(f"EasyOCR could not start: {startup_error}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", APP_ORIGIN)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", APP_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"error": "Not found"})
            return
        self.send_json(200, {
            "ready": reader is not None,
            "loading": reader is None and startup_error is None,
            "error": startup_error,
        })

    def do_POST(self):
        if self.path != "/ocr":
            self.send_json(404, {"error": "Not found"})
            return
        if reader is None:
            self.send_json(503, {"error": startup_error or "EasyOCR is still loading"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_BYTES:
                self.send_json(413, {"error": "Image must be smaller than 40 MB"})
                return

            raw = self.rfile.read(length)
            from PIL import Image
            import numpy as np

            image = np.asarray(Image.open(BytesIO(raw)).convert("RGB"))
            with reader_lock:
                lines = reader.readtext(image, detail=0, paragraph=True)
            text = "\n".join(str(line).strip() for line in lines if str(line).strip())
            self.send_json(200, {"text": text})
        except Exception as error:
            self.send_json(400, {"error": f"{type(error).__name__}: {error}"})

    def log_message(self, format_string, *args):
        print(f"EasyOCR API: {format_string % args}", flush=True)


def main():
    threading.Thread(target=initialize_reader, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"EasyOCR service listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
