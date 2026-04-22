(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LocalNeuralTtsRuntimeStatus = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RuntimeStates = Object.freeze({
    MISSING: "runtime_missing",
    LOADING: "runtime_loading",
    READY: "runtime_ready",
    ERROR: "runtime_error"
  });

  var ModelStates = Object.freeze({
    MISSING: "model_missing",
    LOADING: "model_loading",
    READY: "model_ready",
    ERROR: "model_error"
  });

  var SynthesisStates = Object.freeze({
    IDLE: "idle",
    RUNNING: "synthesis_running",
    FAILED: "synthesis_failed",
    FALLBACK: "fallback_used"
  });

  function createInitialStatus() {
    return {
      runtimeStatus: RuntimeStates.MISSING,
      modelStatus: ModelStates.MISSING,
      synthesisStatus: SynthesisStates.IDLE,
      runtimeError: null,
      modelError: null,
      synthesisError: null,
      actualBackend: "unavailable",
      fallbackReason: null,
      runtimeName: "sherpa-onnx",
      runtimePath: null,
      modelPath: null,
      configPath: null,
      tokensPath: null,
      dataDirPath: null,
      modelLoadMs: undefined,
      checksumStatus: "missing",
      configChecksumStatus: "missing"
    };
  }

  return {
    RuntimeStates: RuntimeStates,
    ModelStates: ModelStates,
    SynthesisStates: SynthesisStates,
    createInitialStatus: createInitialStatus
  };
});
