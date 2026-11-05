import json, sys, re, subprocess, unicodedata, os
from faster_whisper import WhisperModel
import numpy as np
def pcm(path):
    raw=subprocess.run(["ffmpeg","-v","error","-i",path,"-f","f32le","-ac","1","-ar","16000","-"],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32)
OUT = r"E:\projects\corpus_ulpan_linguistpro\audio-google-tts-2026-11-05"
MODEL = os.path.expandvars(r"%LOCALAPPDATA%\LinguistPro\LocalASR\models\asr\ivrit-ai--whisper-large-v3-turbo-ct2\72ad623a37947395efcc3933132353790e5a12f5")
log = json.load(open(OUT + r"\bake-log.json", encoding="utf-8"))
m = WhisperModel(MODEL, device="cpu", compute_type="int8")
def norm(s):
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[\u0591-\u05C7]", "", s)
    s = re.sub(r"[^\u05D0-\u05EA ]", " ", s)
    return " ".join(s.split())
def probe(path):
    d = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",path],capture_output=True,text=True).stdout.strip())
    sd = subprocess.run(["ffmpeg","-hide_banner","-i",path,"-af","silencedetect=noise=-45dB:d=0.08","-f","null","-"],capture_output=True,text=True).stderr
    starts=[float(x) for x in re.findall(r"silence_start: ([\d.]+)",sd)]; ends=[float(x) for x in re.findall(r"silence_end: ([\d.]+)",sd)]
    lead = ends[0] if starts and starts[0] < 0.01 and ends else 0.0
    trail = d - starts[-1] if starts and (len(ends) < len(starts)) else 0.0
    return round(d,2), round(lead,2), round(trail,2)
plain_expected = {}
res = []
for c in log["clips"]:
    path = OUT + "\\" + c["file"].replace("/", "\\")
    segs, info = m.transcribe(pcm(path), language="he", beam_size=5, vad_filter=False, condition_on_previous_text=False)
    hyp = " ".join(s.text for s in segs).strip()
    exp = c["text"] if c["variant"]=="plain" else None
    dur, lead, trail = probe(path)
    res.append({**{k:c[k] for k in ("id","voice","variant","text")}, "asr":hyp, "dur":dur, "lead":lead, "trail":trail})
json.dump(res, open(OUT + r"\asr-check.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
# compare against manifest plain text
man = {c["id"]:c["text"] for c in log["clips"] if c["variant"]=="plain"}
for r in res:
    ok = norm(r["asr"]) == norm(man[r["id"]])
    print(("OK  " if ok else "DIFF"), r["voice"].replace("he-IL-",""), r["variant"].ljust(6), r["id"].ljust(8), f'{r["dur"]:.2f}s lead{r["lead"]:.2f} trail{r["trail"]:.2f}', "|", man[r["id"]], "=>", r["asr"])
