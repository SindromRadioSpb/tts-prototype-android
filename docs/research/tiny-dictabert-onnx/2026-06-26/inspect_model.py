"""R3 spike — inspect dictabert-tiny-joint architecture before ONNX export."""
import sys, json
import torch
from transformers import AutoModel, AutoTokenizer, AutoConfig

MID = "dicta-il/dictabert-tiny-joint"
print("loading", MID, "...")
tok = AutoTokenizer.from_pretrained(MID)
cfg = AutoConfig.from_pretrained(MID, trust_remote_code=True)
model = AutoModel.from_pretrained(MID, trust_remote_code=True)
model.eval()

print("\n=== CONFIG ===")
print("class:", model.__class__.__name__)
print("hidden_size:", getattr(cfg, "hidden_size", "?"), "| num_layers:", getattr(cfg, "num_hidden_layers", "?"),
      "| heads:", getattr(cfg, "num_attention_heads", "?"), "| vocab:", getattr(cfg, "vocab_size", "?"))
nparam = sum(p.numel() for p in model.parameters())
print("params:", f"{nparam/1e6:.1f}M", "| F32 MB:", f"{nparam*4/1e6:.0f}")

print("\n=== TOP-LEVEL CHILDREN (heads) ===")
for name, child in model.named_children():
    np = sum(p.numel() for p in child.parameters())
    print(f"  {name:24s} {child.__class__.__name__:30s} {np/1e6:7.2f}M")

print("\n=== forward signature ===")
import inspect as pyinspect
try:
    print(pyinspect.signature(model.forward))
except Exception as e:
    print("sig err:", e)

print("\n=== sample inference (predict API if present) ===")
sent = "השלום עליכם"
try:
    out = model.predict([sent], tok)
    print("predict() OK; type:", type(out))
    print(json.dumps(out, ensure_ascii=False)[:800])
except Exception as e:
    print("predict() failed:", repr(e)[:200])

print("\n=== raw forward output structure ===")
enc = tok([sent], return_tensors="pt")
with torch.no_grad():
    try:
        raw = model(**enc)
        print("forward output type:", type(raw))
        if hasattr(raw, "keys"):
            for k in raw.keys():
                v = raw[k]
                print("   ", k, type(v).__name__, getattr(v, "shape", ""))
        elif isinstance(raw, (tuple, list)):
            for i, v in enumerate(raw):
                print("   [", i, "]", type(v).__name__, getattr(v, "shape", ""))
    except Exception as e:
        print("forward failed:", repr(e)[:300])
print("\nDONE-INSPECT")
