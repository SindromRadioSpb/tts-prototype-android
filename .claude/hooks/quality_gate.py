import subprocess
import sys

def run(cmd: str) -> str:
    p = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return p.stdout

def main() -> int:
    # Only run if inside a git repo
    try:
        inside = run("git rev-parse --is-inside-work-tree").strip()
        if inside != "true":
            return 0
    except Exception:
        return 0

    sys.stderr.write("=== GLOBAL QUALITY GATE ===\n")
    sys.stderr.write(run("git status") + "\n")
    sys.stderr.write(run("git diff --stat") + "\n")
    sys.stderr.write(
        "Reminder: before finalizing, run the repo smoke-check and record results.\n"
    )
    return 0

if __name__ == "__main__":
    sys.exit(main())
