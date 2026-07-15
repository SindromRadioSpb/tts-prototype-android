"use strict";

// Wave 2 N1 pure policy boundary. Keep this module free of database, clock and
// transport imports so the decision matrix can be verified independently.
function selectChannel({ pushEligible, telegramEligible, lastClaimedChannel } = {}) {
  const push = !!pushEligible;
  const telegram = !!telegramEligible;
  if (!push && !telegram) return { selected: null, reason: "NO_ELIGIBLE_CHANNEL" };
  if (push && !telegram) return { selected: "push", reason: "ONLY_PUSH_ELIGIBLE" };
  if (!push && telegram) return { selected: "telegram", reason: "ONLY_TELEGRAM_ELIGIBLE" };
  if (lastClaimedChannel === "push") return { selected: "telegram", reason: "ALTERNATE_AFTER_PUSH" };
  if (lastClaimedChannel === "telegram") return { selected: "push", reason: "ALTERNATE_AFTER_TELEGRAM" };
  return { selected: "push", reason: "COLD_START_PUSH" };
}

module.exports = { selectChannel };
