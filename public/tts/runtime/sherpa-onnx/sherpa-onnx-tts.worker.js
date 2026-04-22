let tts = null;
function createBundledVitsConfig() {
  return {
    offlineTtsModelConfig: {
      offlineTtsVitsModelConfig: {
        model: "./en_US-libritts_r-medium.onnx",
        lexicon: "",
        tokens: "./tokens.txt",
        dataDir: "./espeak-ng-data",
        noiseScale: 0.667,
        noiseScaleW: 0.8,
        lengthScale: 1.0
      },
      offlineTtsMatchaModelConfig: {
        acousticModel: "",
        vocoder: "",
        lexicon: "",
        tokens: "",
        dataDir: "",
        noiseScale: 0.667,
        lengthScale: 1.0
      },
      offlineTtsKokoroModelConfig: {
        model: "",
        voices: "",
        tokens: "",
        dataDir: "",
        lengthScale: 1.0,
        lexicon: "",
        lang: ""
      },
      offlineTtsKittenModelConfig: {
        model: "",
        voices: "",
        tokens: "",
        dataDir: "",
        lengthScale: 1.0
      },
      offlineTtsZipVoiceModelConfig: {
        tokens: "",
        encoder: "",
        decoder: "",
        vocoder: "",
        dataDir: "",
        lexicon: "",
        featScale: 0.1,
        tShift: 0.5,
        targetRMS: 0.1,
        guidanceScale: 1.0
      },
      offlineTtsPocketModelConfig: {
        lmFlow: "",
        lmMain: "",
        encoder: "",
        decoder: "",
        textConditioner: "",
        vocabJson: "",
        tokenScoresJson: "",
        voiceEmbeddingCacheCapacity: 50
      },
      numThreads: 1,
      debug: 1,
      provider: "cpu"
    },
    ruleFsts: "",
    ruleFars: "",
    maxNumSentences: 1
  };
}

self.Module = {
  // https://emscripten.org/docs/api_reference/module.html#Module.locateFile
  locateFile: function (path, scriptDirectory = "") {
    return scriptDirectory + path;
  },
  // https://emscripten.org/docs/api_reference/module.html#Module.locateFile
  setStatus: function (status) {
    self.postMessage({ type: "sherpa-onnx-tts-progress", status });
  },
  onRuntimeInitialized: function () {
    console.log("Model files downloaded!");
    console.log("Initializing tts ......");
    try {
      tts = createOfflineTts(self.Module, createBundledVitsConfig());
      self.postMessage({
        type: "sherpa-onnx-tts-ready",
        modelType: getDefaultOfflineTtsModelType(),
        numSpeakers: tts.numSpeakers,
      });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: "TTS Initialization failed: " + e.message,
      });
    }
  },
};
importScripts("sherpa-onnx-wasm-main-tts.js");
importScripts("sherpa-onnx-tts.js");

function getErrorMessage(err) {
  if (err instanceof Error) {
    if (err.stack) {
      return `${err.message}\n${err.stack}`;
    }
    return err.message;
  }

  return `${err}`;
}

self.onmessage = async (e) => {
  const { type, text, sid, speed, genConfig } = e.data;
  if (type === "generate") {
    if (!tts) {
      return;
    }
    try {
      const audio = tts.generate({
        text: text,
        sid: sid || 0,
        speed: speed || 1.0,
      });
      const samples = audio.samples;
      const sampleRate = tts.sampleRate;
      self.postMessage(
        {
          type: "sherpa-onnx-tts-result",
          samples: samples,
          sampleRate: sampleRate,
        },
        [samples.buffer],
      );
    } catch (err) {
      self.postMessage({
        type: "error",
        message: "Generation failed: " + getErrorMessage(err),
      });
    }
  } else if (type === "generateWithConfig") {
    if (!tts) {
      return;
    }
    try {
      const config = Object.assign({}, genConfig || {});
      config.callback = (samples, n, progress) => {
        self.postMessage({
          type: "sherpa-onnx-tts-generation-progress",
          progress: progress,
        });
        return 1;
      };

      const audio = tts.generateWithConfig(text, config);
      const samples = audio.samples;
      const sampleRate = audio.sampleRate;
      self.postMessage(
          {
            type: "sherpa-onnx-tts-result",
            samples: samples,
            sampleRate: sampleRate,
          },
          [samples.buffer],
      );
    } catch (err) {
      self.postMessage({
        type: "error",
        message: "Generation failed: " + getErrorMessage(err),
      });
    }
  }
};
