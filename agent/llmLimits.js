"use strict";

function positiveEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function managedLimits(provider) {
  const perUserDaily = positiveEnv("AGENT_LLM_DAILY_PER_USER", 50);
  if (provider !== "gemini") {
    return { perUserDaily, globalDaily: positiveEnv("AGENT_LLM_DAILY_GLOBAL", 200), providerDaily: 0, providerMinute: 0 };
  }
  const freeRpd = positiveEnv("AGENT_GEMINI_FREE_RPD", 500);
  const freeRpm = positiveEnv("AGENT_GEMINI_FREE_RPM", 15);
  const utilization = Math.min(100, positiveEnv("AGENT_GEMINI_FREE_UTILIZATION_PERCENT", 60));
  const providerDaily = Math.max(1, Math.floor(freeRpd * utilization / 100));
  const providerMinute = Math.max(1, Math.floor(freeRpm * utilization / 100));
  return {
    perUserDaily,
    globalDaily: positiveEnv("AGENT_LLM_DAILY_GLOBAL", providerDaily),
    providerDaily,
    providerMinute,
    utilizationPercent: utilization,
  };
}

module.exports = { managedLimits };
