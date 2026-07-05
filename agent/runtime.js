"use strict";

// agent/runtime.js — CLG-P6 фасад agent runtime для server.js (§9 «принятый план»).
// Слайс 1: сценарий /plan (read-only) + status. Роли planner/tutor/reviewer/explainer/
// recommender/grader материализуются посценарно (tutor/explainer — слайс /explain;
// reviewer/grader — после гейтов 4.8); фасад намеренно узкий — сервер видит сценарии,
// не внутренности. Прямого SQLite здесь нет (только через db/agentRepo и tools).

const path = require("path");
const planner = require(path.join(__dirname, "planner"));
const tools = require(path.join(__dirname, "tools"));
const llm = require(path.join(__dirname, "llm"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));

async function plan(ctx) {
  return planner.plan(ctx);
}

async function status(ctx) {
  const usage = await agentRepo.usageToday(ctx.userId);
  const profile = await agentRepo.getProfile(ctx.userId);
  return {
    provider: llm.providerName(),
    kill_switch: llm.killSwitchOn(),
    limits: {
      llm_daily_per_user: Number(process.env.AGENT_LLM_DAILY_PER_USER) || 50,
      llm_daily_global: Number(process.env.AGENT_LLM_DAILY_GLOBAL) || 200,
    },
    usage,
    profile: { mode: profile.mode, language: profile.language },
    tools: tools.listTools(),
  };
}

async function listTasks(ctx, opts) {
  return agentRepo.listTasks(ctx.userId, opts || {});
}

async function updateProfile(ctx, patch) {
  const p = await agentRepo.updateProfile(ctx.userId, patch || {});
  return { mode: p.mode, language: p.language };
}

module.exports = { plan, status, listTasks, updateProfile };
