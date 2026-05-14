# scripts/quiz/validate-against-mirt.R — external Rasch cross-check.
#
# Run on a machine with R and the `mirt` package installed:
#   Rscript scripts/quiz/validate-against-mirt.R
#
# This script reads scripts/quiz/__fixtures__/mirt-reference.json, refits
# theta via mirt::fscores(..., method="ML"), and reports:
#   - Pearson r(theta_js, theta_mirt)
#   - MAD(theta_js, theta_mirt)
#   - SE divergence
#
# Acceptance per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §14:
#   r > 0.99, MAD < 0.05, |SE_js - SE_mirt| mean < 0.05.
#
# If `validate-bank.js` and the bank are unchanged, this output should also
# be unchanged. If the operator wants to PROMOTE mirt's output to canonical
# fixture, replace ref_theta_ml / ref_se in the JSON with mirt's values and
# re-run scoring-smoke; case 6 should still pass (r > 0.99).

if (!requireNamespace("jsonlite", quietly = TRUE)) install.packages("jsonlite")
if (!requireNamespace("mirt",     quietly = TRUE)) install.packages("mirt")
library(jsonlite)
library(mirt)

fixture <- fromJSON("scripts/quiz/__fixtures__/mirt-reference.json")
betas   <- fixture$bank_item_difficulties$beta

# Build the response matrix (grade only — picks irrelevant for IRT).
resp_grade <- do.call(rbind, lapply(fixture$respondents$responses_grade, function(r) {
  unlist(r)
}))
colnames(resp_grade) <- fixture$bank_item_difficulties$id

# Fit a Rasch model with FIXED difficulties to match the JS engine.
spec <- "F = 1-20\n"
mod <- mirt(data.frame(resp_grade), 1, itemtype = "Rasch",
            pars = data.frame(item = colnames(resp_grade),
                              name = "d", value = -betas, est = FALSE),
            verbose = FALSE)

theta_mirt <- fscores(mod, method = "ML", full.scores.SE = TRUE)
theta_js   <- fixture$respondents$ref_theta_ml
se_js      <- fixture$respondents$ref_se

theta_mirt_vec <- theta_mirt[, "F"]
se_mirt_vec    <- theta_mirt[, "SE_F"]

# Cap mirt's extreme theta to [-3, 3] (mirt returns +/- Inf for perfect patterns).
theta_mirt_vec <- pmax(-3, pmin(3, theta_mirt_vec))

cat(sprintf("n = %d respondents\n", length(theta_js)))
cat(sprintf("Pearson r(theta_js, theta_mirt) = %.4f\n",
            cor(theta_js, theta_mirt_vec)))
cat(sprintf("MAD(theta_js, theta_mirt)       = %.4f\n",
            mean(abs(theta_js - theta_mirt_vec))))
cat(sprintf("Mean |SE_js - SE_mirt|          = %.4f\n",
            mean(abs(se_js - se_mirt_vec), na.rm = TRUE)))
