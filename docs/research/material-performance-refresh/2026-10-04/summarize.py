"""Rebuild summary.json from checked-in raw measurements; Python standard library only."""
import json
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parent


def load_series(pattern):
    return [(p.name, json.loads(p.read_text(encoding="utf-8"))) for p in sorted(ROOT.glob(pattern))]


def summarize(series):
    metrics = {}
    for _, report in series:
        for key, metric in report["metrics"].items():
            metrics.setdefault(key, []).extend(metric["samplesMs"])
    return {key: {"n": len(values), "medianMs": statistics.median(values),
                  "minMs": min(values), "maxMs": max(values)} for key, values in metrics.items()}


result = {}
for scenario in ["workflows", "import"]:
    series = {side: load_series(f"{scenario}-{side}-*.json") for side in ["before", "after"]}
    values = {side: summarize(reports) for side, reports in series.items()}
    result[scenario] = {"sources": {side: [name for name, _ in reports] for side, reports in series.items()},
                        **values, "changePercent": {
                            key: 100 * (values["after"][key]["medianMs"] / metric["medianMs"] - 1)
                            for key, metric in values["before"].items() if key in values["after"]}}
    if scenario == "import":
        result[scenario]["competingWrites"] = {
            side: {"success": sum(r["competingWrite"]["ok"] for _, d in reports for r in d["results"]),
                   "failed": sum(not r["competingWrite"]["ok"] for _, d in reports for r in d["results"])}
            for side, reports in series.items()}
    else:
        result[scenario]["crossTabCounts"] = {}
        for side, reports in series.items():
            samples = [r for _, d in reports for group in d["results"] for r in group["crossTab"]]
            result[scenario]["crossTabCounts"][side] = {
                "n": len(samples), "metadataReads": sum(r["media"]["reads"] for r in samples),
                "mediaRenders": sum(r["media"]["renders"] for r in samples),
                "readerWordInvalidations": sum(r["reader"]["words"] for r in samples)}
production = json.loads((ROOT / "production.json").read_text(encoding="utf-8"))
assert production["status"] == "PASS"
for index in [0, 1]:
    assert len({(r["materials"][index]["work"], r["materials"][index]["snapshot"])
                for r in production["results"]}) == 1, "Production material changed between samples"
result["production"] = production["metrics"]
(ROOT / "summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
