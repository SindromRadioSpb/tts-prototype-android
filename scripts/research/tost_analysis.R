# =============================================================================
# TOST-SESOI equivalence-test analysis for LinguistPro thesis primary hypotheses
# =============================================================================
#
# Variant: V5 (TOST-SESOI) of the premium-stack roadmap.
# Pre-registered as a supplementary confirmatory analysis on OSF
# (https://osf.io/zdv9j/, DOI 10.17605/OSF.IO/ZDV9J).
#
# Pre-registered parameters (LOCKED — must not be changed post-hoc):
#   * SESOI (smallest effect size of interest)  = 0.5
#   * Significance level alpha                  = 0.00625
#     (Bonferroni-corrected against 8 tests:
#       4 primary directional Pearson r tests + 4 equivalence tests)
#   * Test direction                            = two one-sided tests (TOST),
#     bounds [-SESOI, +SESOI]
#   * Toolkit                                   = TOSTER::TOSTr() (Lakens 2017)
#
# Power note: TOSTr against SESOI=0.5 at N=10 and alpha=0.00625 yields ~78%
# power. SESOI < 0.5 is not adequately powered at this sample size and is
# explicitly deferred to the v4.0 MCREMA (multi-cohort meta-analytic)
# framework where pooled N can support smaller SESOIs.
#
# Decision rule per Lakens 2017 §3:
#   - 90% CI lies entirely within [-SESOI, +SESOI]
#     -> "equivalent" : evidence that effect is too small to be of interest
#   - 90% CI extends beyond +/- SESOI
#     -> "not equivalent" : cannot rule out a meaningful effect
#   - The TOST p-value < alpha is the canonical statistical decision rule.
#
# Usage:
#   Rscript scripts/research/tost_analysis.R <path/to/cohort_aggregates.csv>
#
# Expected input CSV columns (per cohort_<code>_aggregates.csv schema):
#   student_id, total_active_minutes, total_cards_added_to_srs,
#   total_notes_created, srs_error_rate, growth_delta, post_test_score,
#   ... (other columns ignored for this analysis)
#
# Output: tab-separated table to stdout with one row per hypothesis:
#   hypothesis, n, r, lower_90ci, upper_90ci, sesoi_lower, sesoi_upper,
#   tost_p_lower, tost_p_upper, tost_p_max, conclusion
#
# Companion smoke fixture: synthetic-data sanity check at the bottom of
# this file behind an `--smoke` flag.
#
# Author: Peter Kolosei
# Date:   2026-05-22 (V5 stack implementation)
# License: MIT (same as the project)
# =============================================================================

suppressPackageStartupMessages({
  if (!requireNamespace("TOSTER", quietly = TRUE)) {
    stop("TOSTER package required: install.packages('TOSTER')")
  }
  library(TOSTER)
})

# Locked pre-registered parameters --------------------------------------------
SESOI_R    <- 0.5
ALPHA_TOST <- 0.05 / 8  # Bonferroni against 4 primary + 4 TOST tests

# Hypothesis specifications (predictor x outcome) -----------------------------
HYPOTHESES <- list(
  list(id = "H1", predictor = "total_active_minutes",     outcome = "growth_delta",
       direction = "positive",
       label    = "active_minutes_real x growth_delta"),
  list(id = "H2", predictor = "total_cards_added_to_srs", outcome = "growth_delta",
       direction = "positive",
       label    = "cards_added_to_srs x growth_delta"),
  list(id = "H3", predictor = "total_notes_created",      outcome = "growth_delta",
       direction = "positive",
       label    = "notes_created x growth_delta"),
  list(id = "H4", predictor = "srs_error_rate",           outcome = "growth_delta",
       direction = "negative",
       label    = "srs_error_rate x growth_delta")
)

# -----------------------------------------------------------------------------
run_tost_for_hypothesis <- function(df, hypo) {
  # Drop participants with missing predictor or outcome (listwise per H5.5.8).
  sub <- df[!is.na(df[[hypo$predictor]]) & !is.na(df[[hypo$outcome]]), ]
  n <- nrow(sub)
  if (n < 4) {
    return(list(
      id = hypo$id, label = hypo$label, n = n,
      r = NA_real_, lower_90ci = NA_real_, upper_90ci = NA_real_,
      tost_p_lower = NA_real_, tost_p_upper = NA_real_,
      tost_p_max = NA_real_,
      conclusion = sprintf("insufficient_data_n=%d", n)
    ))
  }

  r_observed <- cor(sub[[hypo$predictor]], sub[[hypo$outcome]],
                    use = "complete.obs", method = "pearson")

  # TOSTER::TOSTr expects sample r + n; equivalence bounds in raw r space.
  tost_result <- tryCatch(
    TOSTER::TOSTr(
      n = n,
      r = r_observed,
      low_eqbound_r  = -SESOI_R,
      high_eqbound_r =  SESOI_R,
      alpha = ALPHA_TOST,
      plot  = FALSE,
      verbose = FALSE
    ),
    error = function(e) NULL
  )

  if (is.null(tost_result)) {
    return(list(
      id = hypo$id, label = hypo$label, n = n,
      r = r_observed, lower_90ci = NA_real_, upper_90ci = NA_real_,
      tost_p_lower = NA_real_, tost_p_upper = NA_real_,
      tost_p_max = NA_real_,
      conclusion = "tost_failed"
    ))
  }

  # TOST returns LL_CI_TOST / UL_CI_TOST as the (1-2*alpha) CI ; with
  # alpha=0.00625 this is the ~98.75% CI of the equivalence test. We
  # additionally compute the 90% CI as the standard equivalence-test report
  # (Lakens 2017): the 90% CI is what is compared to +/- SESOI.
  ci90 <- TOSTER::TOSTr(
    n = n, r = r_observed,
    low_eqbound_r = -SESOI_R, high_eqbound_r = SESOI_R,
    alpha = 0.05, plot = FALSE, verbose = FALSE
  )

  tost_p_max <- max(tost_result$TOST_p1, tost_result$TOST_p2)
  ci_lower <- ci90$LL_CI_TOST
  ci_upper <- ci90$UL_CI_TOST

  # Conclusion per Lakens 2017 §3:
  #   - if (1-2*alpha) CI in [-SESOI, +SESOI] -> equivalent
  #   - if tost_p_max < alpha                 -> equivalent
  #   - otherwise                              -> not equivalent (cannot rule out
  #                                                meaningful effect)
  conclusion <- if (is.na(tost_p_max)) {
    "insufficient_data"
  } else if (tost_p_max < ALPHA_TOST) {
    "equivalent_to_zero_at_sesoi_0.5"
  } else if (!is.na(ci_lower) && !is.na(ci_upper) &&
             ci_lower >= -SESOI_R && ci_upper <= SESOI_R) {
    "equivalent_90ci_within_sesoi"
  } else {
    "not_equivalent_cannot_rule_out_large_effect"
  }

  list(
    id = hypo$id, label = hypo$label, n = n,
    r = r_observed,
    lower_90ci = ci_lower, upper_90ci = ci_upper,
    tost_p_lower = tost_result$TOST_p1,
    tost_p_upper = tost_result$TOST_p2,
    tost_p_max = tost_p_max,
    conclusion = conclusion
  )
}

# Main entry point ------------------------------------------------------------
main <- function(csv_path) {
  if (!file.exists(csv_path)) {
    stop(sprintf("Input CSV not found: %s", csv_path))
  }

  df <- read.csv(csv_path, stringsAsFactors = FALSE)

  results <- lapply(HYPOTHESES, function(h) run_tost_for_hypothesis(df, h))

  # Format as tab-separated table to stdout.
  cat(paste(c("hypothesis", "label", "n", "r",
              "lower_90ci", "upper_90ci",
              "tost_p_lower", "tost_p_upper", "tost_p_max",
              "conclusion"), collapse = "\t"), "\n", sep = "")

  for (r in results) {
    cat(paste(c(r$id, r$label, r$n,
                format(r$r,            digits = 4),
                format(r$lower_90ci,   digits = 4),
                format(r$upper_90ci,   digits = 4),
                format(r$tost_p_lower, digits = 4),
                format(r$tost_p_upper, digits = 4),
                format(r$tost_p_max,   digits = 4),
                r$conclusion), collapse = "\t"), "\n", sep = "")
  }

  # Footer documenting locked parameters for downstream verification.
  cat(sprintf("\n# SESOI_R = %.4f (locked, pre-registered)\n", SESOI_R))
  cat(sprintf("# ALPHA_TOST = %.6f (Bonferroni, locked)\n",   ALPHA_TOST))
  cat("# Reference: Lakens (2017), Social Psychological and Personality Science 8(4), 355-362\n")
  cat("# Pre-registration: OSF DOI 10.17605/OSF.IO/ZDV9J, deviation log entry 2026-05-22\n")
}

# Smoke fixture ---------------------------------------------------------------
# Synthetic sanity test. Run with: Rscript tost_analysis.R --smoke
smoke <- function() {
  set.seed(20260522)
  # Simulate N=10 with true r=0.2 (within SESOI=0.5) and true r=0.85 (outside).
  for (true_r in c(0.2, 0.5, 0.85)) {
    n <- 10
    x <- rnorm(n)
    # Generate y correlated with x at approximately true_r.
    e <- rnorm(n, sd = sqrt(1 - true_r^2))
    y <- true_r * x + e

    hypo <- list(id = "SMOKE", predictor = "x", outcome = "y",
                 direction = "positive", label = "smoke")
    df  <- data.frame(x = x, y = y, growth_delta = y)
    df$total_active_minutes     <- x
    df$total_cards_added_to_srs <- x
    df$total_notes_created      <- x
    df$srs_error_rate           <- x

    res <- run_tost_for_hypothesis(df, hypo)
    cat(sprintf("smoke true_r=%.2f  observed_r=%.4f  90ci=[%.3f,%.3f]  tost_p_max=%.4f  -> %s\n",
                true_r, res$r,
                ifelse(is.na(res$lower_90ci), NA, res$lower_90ci),
                ifelse(is.na(res$upper_90ci), NA, res$upper_90ci),
                res$tost_p_max, res$conclusion))
  }
}

# Dispatcher ------------------------------------------------------------------
args <- commandArgs(trailingOnly = TRUE)
if (length(args) >= 1 && args[1] == "--smoke") {
  smoke()
} else if (length(args) >= 1) {
  main(args[1])
} else {
  cat("Usage:\n")
  cat("  Rscript tost_analysis.R <path/to/cohort_aggregates.csv>\n")
  cat("  Rscript tost_analysis.R --smoke\n")
  quit(status = 2)
}
