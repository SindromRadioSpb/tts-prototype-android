"""R3 spike — export dictabert-tiny-joint ENCODER to ONNX, quantize, measure size + latency.
The encoder (bert, 44.67M) + embeddings dominate the 45.2M model; the heads we'd ship for Tier-3
(morph 0.02M / prefix 0.20M / ner 0.01M) are negligible, and we drop the 40M MLM/lemma head. So
the encoder-only quantized size ≈ the deployable Tier-3 model size. Representative + cheap."""
import os, time, json
os.environ["PYTHONIOENCODING"] = "utf-8"
import torch
from transformers import AutoModel, AutoTokenizer
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType
import onnxruntime as ort

OUT = os.path.dirname(os.path.abspath(__file__))
MID = "dicta-il/dictabert-tiny-joint"
res = {}

tok = AutoTokenizer.from_pretrained(MID)
full = AutoModel.from_pretrained(MID, trust_remote_code=True).eval()
encoder = full.bert  # BertModel
enc_params = sum(p.numel() for p in encoder.parameters())
res["encoder_params_M"] = round(enc_params/1e6, 2)

# dummy inputs
sent = "השלום עליכם חברים"
enc_in = tok([sent], return_tensors="pt")
inputs = (enc_in["input_ids"], enc_in["attention_mask"], enc_in.get("token_type_ids", torch.zeros_like(enc_in["input_ids"])))

f32_path = os.path.join(OUT, "encoder_fp32.onnx")
print("exporting encoder → ONNX (fp32) ...")
torch.onnx.export(
    encoder, inputs, f32_path,
    input_names=["input_ids", "attention_mask", "token_type_ids"],
    output_names=["last_hidden_state"],
    dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"},
                  "token_type_ids": {0: "b", 1: "s"}, "last_hidden_state": {0: "b", 1: "s"}},
    opset_version=17, do_constant_folding=True,
)
res["fp32_MB"] = round(os.path.getsize(f32_path)/1e6, 1)

# dynamic int8 quantization
int8_path = os.path.join(OUT, "encoder_int8.onnx")
print("quantizing → int8 ...")
quantize_dynamic(f32_path, int8_path, weight_type=QuantType.QInt8)
res["int8_MB"] = round(os.path.getsize(int8_path)/1e6, 1)

# try 4-bit (matmul) quantization
q4_MB = None
try:
    from onnxruntime.quantization import matmul_4bits_quantizer
    q4_path = os.path.join(OUT, "encoder_q4.onnx")
    print("quantizing → int4 (matmul) ...")
    m = onnx.load(f32_path)
    quant = matmul_4bits_quantizer.MatMul4BitsQuantizer(m, block_size=32, is_symmetric=True)
    quant.process()
    quant.model.save_model_to_file(q4_path, use_external_data_format=False)
    q4_MB = round(os.path.getsize(q4_path)/1e6, 1)
except Exception as e:
    res["q4_error"] = repr(e)[:160]
res["q4_MB"] = q4_MB

# tokenizer size (must also ship)
import glob
tjson = None
for c in glob.glob(os.path.expanduser("~/.cache/huggingface/**/tokenizer.json"), recursive=True):
    if "dictabert-tiny-joint" in c or "dictabert_hyphen_joint" in c: tjson = c; break
res["tokenizer_json_MB"] = round(os.path.getsize(tjson)/1e6, 2) if tjson else "?"

# latency micro-bench (onnxruntime CPU, int8) — proxy for WASM Worker
print("latency bench (int8, CPU) ...")
sess = ort.InferenceSession(int8_path, providers=["CPUExecutionProvider"])
feed = {"input_ids": enc_in["input_ids"].numpy(), "attention_mask": enc_in["attention_mask"].numpy(),
        "token_type_ids": (enc_in.get("token_type_ids") if enc_in.get("token_type_ids") is not None else torch.zeros_like(enc_in["input_ids"])).numpy()}
for _ in range(3): sess.run(None, feed)  # warmup
N = 30; t0 = time.time()
for _ in range(N): sess.run(None, feed)
res["int8_latency_ms_per_sent_cpu"] = round((time.time()-t0)/N*1000, 1)
res["bench_seq_len"] = int(enc_in["input_ids"].shape[1])

with open(os.path.join(OUT, "export_result.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
print("RESULT", json.dumps(res, ensure_ascii=False))
print("DONE-EXPORT")
