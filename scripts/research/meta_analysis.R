# =============================================================================
# Multi-Cohort Random-Effects Meta-Analysis (MCREMA) for LinguistPro thesis
# =============================================================================
#
# Variant: V2 (MCREMA) of the premium-stack roadmap.
# Pre-registered as a future-work protocol on OSF (https://osf.io/zdv9j/).
# Protocol: thesis/META_ANALYSIS_PROTOCOL.md
# Status at diploma defense (2026-05-22): K=1 cohort; this script is
# infrastructure for future K>=3 execution.
#
# Pre-registered parameters (LOCKED — must not be changed post-hoc):
#   * Estimator: REML (Restricted Maximum Likelihood) via metafor::rma()
#   * Effect-size measure: Pearson r -> Fisher z (atanh) -> pooled in
#     z-space -> back-transformed via tanh for reporting
#   * Heterogeneity: tau^2, I^2, Cochran Q
#   * Minimum K for valid pooled inference: K >= 3
#   * Cumulative-evidence rule: report BOTH per-cohort AND pooled;
#     no selective reporting
#   * Deidentification: cohort_label (cohort_001/002/...) NOT cohort_code
#
# Usage:
#   Rscript scripts/research/meta_analysis.R <path/to/meta_analysis_summary.csv>
#
# Input: meta_analysis_summary_YYYY-MM-DD.csv exported from teacher
# dashboard via `window.exportMetaAnalysisCsv()`. Columns:
#   cohort_label, hypothesis_id, n_linked, mean_engagement, sd_engagement,
#   mean_growth, sd_growth, r, fisher_z, fisher_z_se, k_anonymity_met
#
# Output:
#   - Tab-separated table to stdout, one row per hypothesis with
#     {K, pooled_r, pooled_95ci_lower, pooled_95ci_upper, tau_sq, I_sq,
#     Q_pvalue, conclusion}
#   - PNG forest plot per hypothesis: forest_<H1..H4>.png
#   - PNG funnel plot per hypothesis (if K >= 4): funnel_<H1..H4>.png
#
# Companion smoke fixture: scripts/research/meta_analysis_smoke.R
#
# Author: Peter Kolosei
# Date:   2026-05-22 (V2 stack implementation)
# License: MIT (same as the project)
# =============================================================================

suppressPackageStartupMessages({
  if (!requireNamespace("metafor", quietly = TRUE)) {
    stop("metafor package required: install.packages('metafor')")
  }
  library(metafor)
})

# Locked pre-registered parameters --------------------------------------------
MIN_K_FOR_POOLED  <- 3
ESTIMATOR         <- "REML"

# Hypothesis ids per OSF prereg §2 --------------------------------------------
HYPOTHESES <- c("H1", "H2", "H3", "H4")
HYPOTHESES_LABEL <- list(
  H1 = "active_minutes_real x growth_delta",
  H2 = "cards_added_to_srs x growth_delta",
  H3 = "notes_created x growth_delta",
  H4 = "srs_error_rate x growth_delta"
)

# -----------------------------------------------------------------------------
run_meta_for_hypothesis <- function(df_h) {
  # df_h: filtered rows for one hypothesis_id across cohorts.
  # k_anonymity_met == 0 rows are suppressed for inference but reported in
  # the K count as suppressed.
  valid <- df_h[df_h$k_anonymity_met == 1 & !is.na(df_h$fisher_z) &
                  !is.na(df_h$fisher_z_se) & is.finite(df_h$fisher_z) &
                  is.finite(df_h$fisher_z_se) & df_h$fisher_z_se > 0, ]
  K_total      <- nrow(df_h)
  K_suppressed <- sum(df_h$k_anonymity_met == 0)
  K_valid      <- nrow(valid)

  if (K_valid < MIN_K_FOR_POOLED) {
    return(list(
      hypothesis = df_h$hypothesis_id[1],
      label      = HYPOTHESES_LABEL[[df_h$hypothesis_id[1]]],
      K_total = K_total, K_suppressed = K_suppressed, K_valid = K_valid,
      pooled_r = NA, pooled_ci_lower = NA, pooled_ci_upper = NA,
      tau_sq = NA, I_sq = NA, Q_pvalue = NA,
      conclusion = sprintf("insufficient_cohorts_K_valid=%d_min=%d",
                           K_valid, MIN_K_FOR_POOLED)
    ))
  }

  rma_result <- tryCatch(
    metafor::rma(yi = valid$fisher_z, sei = valid$fisher_z_se,
                 method = ESTIMATOR, slab = valid$cohort_label),
    error = function(e) NULL
  )

  if (is.null(rma_result)) {
    return(list(
      hypothesis = df_h$hypothesis_id[1],
      label      = HYPOTHESES_LABEL[[df_h$hypothesis_id[1]]],
      K_total = K_total, K_suppressed = K_suppressed, K_valid = K_valid,
      pooled_r = NA, pooled_ci_lower = NA, pooled_ci_upper = NA,
      tau_sq = NA, I_sq = NA, Q_pvalue = NA,
      conclusion = "rma_failed"
    ))
  }

  # Back-transform pooled estimate from Fisher z to r.
  pooled_r        <- tanh(rma_result$b[1, 1])
  pooled_ci_lower <- tanh(rma_result$ci.lb)
  pooled_ci_upper <- tanh(rma_result$ci.ub)

  list(
    hypothesis = df_h$hypothesis_id[1],
    label      = HYPOTHESES_LABEL[[df_h$hypothesis_id[1]]],
    K_total = K_total, K_suppressed = K_suppressed, K_valid = K_valid,
    pooled_r = pooled_r,
    pooled_ci_lower = pooled_ci_lower,
    pooled_ci_upper = pooled_ci_upper,
    tau_sq   = rma_result$tau2,
    I_sq     = rma_result$I2,
    Q_pvalue = rma_result$QEp,
    conclusion = if (K_valid >= MIN_K_FOR_POOLED) "pooled_valid" else "underpowered",
    rma_result = rma_result
  )
}

emit_plots <- function(res) {
  if (is.null(res$rma_result)) return(invisible())
  K_valid <- res$K_valid
  fp <- sprintf("forest_%s.png", res$hypothesis)
  tryCatch({
    grDevices::png(fp, width = 800, height = max(300, 60 + 30 * K_valid))
    metafor::forest(res$rma_result,
                    header = sprintf("%s — %s", res$hypothesis, res$label),
                    transf = tanh)
    grDevices::dev.off()
    cat(sprintf("# forest plot: %s\n", fp))
  }, error = function(e) {
    cat(sprintf("# forest plot %s skipped: %s\n", fp, conditionMessage(e)))
  })
  if (K_valid >= 4) {
    fnp <- sprintf("funnel_%s.png", res$hypothesis)
    tryCatch({
      grDevices::png(fnp, width = 600, height = 600)
      metafor::funnel(res$rma_result)
      grDevices::dev.off()
      cat(sprintf("# funnel plot: %s\n", fnp))
    }, error = function(e) {
      cat(sprintf("# funnel plot %s skipped: %s\n", fnp, conditionMessage(e)))
    })
  }
}

main <- function(csv_path) {
  if (!file.exists(csv_path)) {
    stop(sprintf("Input CSV not found: %s", csv_path))
  }

  df <- read.csv(csv_path, stringsAsFactors = FALSE)

  # Header row.
  cat(paste(c("hypothesis", "label", "K_total", "K_suppressed", "K_valid",
              "pooled_r", "pooled_ci_lower", "pooled_ci_upper",
              "tau_sq", "I_sq", "Q_pvalue", "conclusion"),
            collapse = "\t"), "\n", sep = "")

  for (hid in HYPOTHESES) {
    df_h <- df[df$hypothesis_id == hid, ]
    if (nrow(df_h) == 0) next
    res <- run_meta_for_hypothesis(df_h)
    cat(paste(c(res$hypothesis, res$label,
                res$K_total, res$K_suppressed, res$K_valid,
                format(res$pooled_r,        digits = 4),
                format(res$pooled_ci_lower, digits = 4),
                format(res$pooled_ci_upper, digits = 4),
                format(res$tau_sq,          digits = 4),
                format(res$I_sq,            digits = 4),
                format(res$Q_pvalue,        digits = 4),
                res$conclusion),
              collapse = "\t"), "\n", sep = "")
    emit_plots(res)
  }

  cat(sprintf("\n# MIN_K_FOR_POOLED = %d (locked)\n", MIN_K_FOR_POOLED))
  cat(sprintf("# ESTIMATOR = %s (locked)\n",         ESTIMATOR))
  cat("# Reference: metafor::rma() (Viechtbauer 2010); REML estimator.\n")
  cat("# Pre-registration: OSF DOI 10.17605/OSF.IO/ZDV9J, deviation log §9.3\n")
}

args <- commandArgs(trailingOnly = TRUE)
if (length(args) >= 1) {
  main(args[1])
} else {
  cat("Usage:\n")
  cat("  Rscript meta_analysis.R <path/to/meta_analysis_summary.csv>\n")
  cat("Companion smoke: Rscript meta_analysis_smoke.R\n")
  quit(status = 2)
}
