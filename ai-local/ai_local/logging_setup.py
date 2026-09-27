import logging
import os
from pathlib import Path
import sys


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    )
    root.addHandler(handler)
    # A detached service writes stdout to DEVNULL, so a failure left no trace (O-031d). When a log
    # file is configured, keep a small rotating copy of the same records.
    log_file = os.environ.get("AI_LOCAL_LOG_FILE", "").strip()
    if log_file:
        try:
            from logging.handlers import RotatingFileHandler

            Path(log_file).parent.mkdir(parents=True, exist_ok=True)
            file_handler = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
            file_handler.setFormatter(handler.formatter)
            root.addHandler(file_handler)
        except OSError:
            pass
    root.setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
