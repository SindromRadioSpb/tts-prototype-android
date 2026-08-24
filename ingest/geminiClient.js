"use strict";

const { GoogleGenAI } = require("@google/genai");

async function generateGeminiContent({ apiKey, scenario, contents, config = {} }) {
  if (!scenario || !scenario.model || scenario.fallbackModel) {
    const error = new Error("Gemini scenario must pin one model and no automatic fallback");
    error.code = "BAD_GEMINI_SCENARIO";
    throw error;
  }
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: scenario.model,
    contents,
    config,
  });
  return {
    text: typeof response.text === "string" ? response.text : "",
    requestedModel: scenario.model,
    modelVersion: typeof response.modelVersion === "string" ? response.modelVersion : null,
    responseId: typeof response.responseId === "string" ? response.responseId : null,
    usageMetadata: response.usageMetadata || null,
  };
}

module.exports = { generateGeminiContent };
