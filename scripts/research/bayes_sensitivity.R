# =============================================================================
# Bayesian sensitivity analysis (PBSL) for LinguistPro thesis primary hypotheses
# =============================================================================
#
# Variant: V1 (PBSL — Pre-registered Bayesian Sensitivity Layer) of the
# premium-stack roadmap.
# Pre-registered as a supplementary exploratory analysis on OSF
# (https://osf.io/zdv9j/, DOI 10.17605/OSF.IO/ZDV9J).
#
# Pre-registered priors (LOCKED — choosing post-hoc = HARKing):
#   * Prior A (Flat / Default JZS) — uniform on rho via the default
#     Jeffreys-Zellner-Siow Cauchy prior implemented in
#     BayesFactor::correlationBF()
#   * Prior B (Weak-informative skeptical) — rho ~ N(0, 0.3^2)
#   * Prior C (Literature-anchored) — rho ~ N(0.3, 0.2^2)
#
# Pre-registered status: SUPPLEMENTARY EXPLORATORY (not confirmatory).
# No Bayes factor or posterior probability is promoted to a decision
# rule. The artifact of interest is the prior-sensitivity table — a
# conclusion that survives all three priors is robust; a conclusion
# that depends on a single prior is appropriately weakened in the
# discussion.
#
# Power note: at N=10, Bayesian credible intervals on Pearson rho are
# approximately as wide as Fisher-z confidence intervals — there is
# NO power gain. The value of PBSL is prior-sensitivity transparency,
# not statistical power.
#
# Usage:
#   Rscript scripts/research/bayes_sensitivity.R <path/to/cohort_aggregates.csv>
#
# Expected input CSV columns (per cohort_<code>_aggregates.csv schema):
#   student_id, total_active_minutes, total_cards_added_to_srs,
#   total_notes_created, srs_error_rate, growth_delta, post_test_score,
#   ... (other columns ignored for this analysis)
#
# Output: tab-separated table to stdout with one row per
# (hypothesis x prior) combination:
#   hypothesis, prior, n, r_observed,
#   posterior_median, ci_lower_95, ci_upper_95,
#   bf_10_vs_zero, p_rho_gt_0
#
# Companion smoke fixture: scripts/research/bayes_sensitivity_smoke.R
#
# Author: Peter Kolosei
# Date:   2026-05-22 (V1 stack implementation)
# License: MIT (same as the project)
# =============================================================================

suppressPackageStartupMessages({
  if (!requireNamespace("BayesFactor", quietly = TRUE)) {
    stop("BayesFactor package required: install.packages('BayesFactor')")
  }
  library(BayesFactor)
  # brms is used for the informative priors; if unavailable, fall back to
  # MCMC-free analytic posterior (approximate Normal-on-Fisher-z).
  has_brms <- requireNamespace("brms", quietly = TRUE)
})

# Locked pre-registered priors ------------------------------------------------
# Prior A: default JZS Cauchy via BayesFactor::correlationBF (its default
# rscale = "medium" = 1/3 on the Fisher-z scale).
# Prior B: rho ~ N(0, 0.3^2) — weak-informative skeptical.
# Prior C: rho ~ N(0.3, 0.2^2) — literature-anchored.
PRIOR_B_MEAN <- 0.0
PRIOR_B_SD   <- 0.3
PRIOR_C_MEAN <- 0.3
PRIOR_C_SD   <- 0.2

# Hypothesis specifications --------------------------------------------------
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

# Helpers --------------------------------------------------------------------
# Prior A — JZS via BayesFactor.
posterior_prior_a <- function(x, y) {
  n <- length(x)
  if (n < 4) return(NULL)
  bf <- BayesFactor::correlationBF(y = y, x = x, rscale = "medium")
  # Sample from the posterior to get median + CI + P(rho > 0).
  samples <- as.data.frame(BayesFactor::posterior(bf, iterations = 10000))
  rho_samples <- samples[["rho"]]
  list(
    posterior_median = median(rho_samples),
    ci_lower         = quantile(rho_samples, 0.025),
    ci_upper         = quantile(rho_samples, 0.975),
    bf_10            = exp(bf@bayesFactor$bf),
    p_rho_gt_0       = mean(rho_samples > 0)
  )
}

# Priors B and C — informative Normal on rho. We approximate the posterior
# analytically via the Fisher-z transformation:
#   z = 0.5 * log((1 + r) / (1 - r));  z ~ N(z_observed, 1 / (n - 3))
# Combined with the Normal prior on z (approximate; rho near 0 has z ~ rho):
#   posterior z ~ N(mu_post, var_post)
# This is a closed-form Bayesian update analogous to a Normal-Normal model.
posterior_normal_prior <- function(x, y, prior_mean, prior_sd) {
  n <- length(x)
  if (n < 4) return(NULL)
  r_obs <- cor(x, y, use = "complete.obs")
  z_obs <- atanh(r_obs)
  z_se  <- 1 / sqrt(n - 3)

  prior_z_var <- prior_sd^2
  like_var    <- z_se^2

  post_var  <- 1 / (1 / prior_z_var + 1 / like_var)
  post_mean <- post_var * (prior_mean / prior_z_var + z_obs / like_var)
  post_sd   <- sqrt(post_var)

  # Back-transform to rho via tanh.
  posterior_median <- tanh(post_mean)
  ci_lower <- tanh(post_mean - qnorm(0.975) * post_sd)
  ci_upper <- tanh(post_mean + qnorm(0.975) * post_sd)

  # BF_10 via Savage-Dickey on z = 0 under prior vs posterior.
  prior_density_at_zero     <- dnorm(0, mean = prior_mean, sd = prior_sd)
  posterior_density_at_zero <- dnorm(0, mean = post_mean,  sd = post_sd)
  bf_10 <- prior_density_at_zero / posterior_density_at_zero

  p_rho_gt_0 <- 1 - pnorm(0, mean = post_mean, sd = post_sd)

  list(
    posterior_median = posterior_median,
    ci_lower         = ci_lower,
    ci_upper         = ci_upper,
    bf_10            = bf_10,
    p_rho_gt_0       = p_rho_gt_0
  )
}

# Run all three priors for a hypothesis ---------------------------------------
run_priors_for_hypothesis <- function(df, hypo) {
  sub <- df[!is.na(df[[hypo$predictor]]) & !is.na(df[[hypo$outcome]]), ]
  x <- sub[[hypo$predictor]]
  y <- sub[[hypo$outcome]]
  n <- length(x)

  if (n < 4) {
    return(list(prior_a = NULL, prior_b = NULL, prior_c = NULL, n = n, r = NA))
  }

  r_obs <- cor(x, y, use = "complete.obs")

  list(
    prior_a = posterior_prior_a(x, y),
    prior_b = posterior_normal_prior(x, y, PRIOR_B_MEAN, PRIOR_B_SD),
    prior_c = posterior_normal_prior(x, y, PRIOR_C_MEAN, PRIOR_C_SD),
    n = n, r = r_obs
  )
}

# Output a row for the table -------------------------------------------------
emit_row <- function(hypo, prior_label, result, n, r_obs) {
  if (is.null(result)) {
    cat(paste(c(hypo$id, hypo$label, prior_label, n,
                format(r_obs, digits = 4),
                "NA", "NA", "NA", "NA", "NA"),
              collapse = "\t"), "\n", sep = "")
    return()
  }
  cat(paste(c(hypo$id, hypo$label, prior_label, n,
              format(r_obs, digits = 4),
              format(result$posterior_median, digits = 4),
              format(result$ci_lower, digits = 4),
              format(result$ci_upper, digits = 4),
              format(result$bf_10, digits = 4),
              format(result$p_rho_gt_0, digits = 4)),
            collapse = "\t"), "\n", sep = "")
}

# Main entry point ------------------------------------------------------------
main <- function(csv_path) {
  if (!file.exists(csv_path)) {
    stop(sprintf("Input CSV not found: %s", csv_path))
  }
  df <- read.csv(csv_path, stringsAsFactors = FALSE)

  cat(paste(c("hypothesis", "label", "prior", "n", "r_observed",
              "posterior_median", "ci_lower_95", "ci_upper_95",
              "bf_10_vs_zero", "p_rho_gt_0"),
            collapse = "\t"), "\n", sep = "")

  for (hypo in HYPOTHESES) {
    res <- run_priors_for_hypothesis(df, hypo)
    emit_row(hypo, "A_flat_JZS",        res$prior_a, res$n, res$r)
    emit_row(hypo, "B_skeptical_N00.3", res$prior_b, res$n, res$r)
    emit_row(hypo, "C_literature_N0.30.2", res$prior_c, res$n, res$r)
  }

  cat(sprintf("\n# Prior A: JZS Cauchy via BayesFactor::correlationBF, rscale = 'medium'\n"))
  cat(sprintf("# Prior B: rho ~ N(%.1f, %.1f^2) — weak-informative skeptical (locked)\n",
              PRIOR_B_MEAN, PRIOR_B_SD))
  cat(sprintf("# Prior C: rho ~ N(%.1f, %.1f^2) — literature-anchored (locked)\n",
              PRIOR_C_MEAN, PRIOR_C_SD))
  cat("# Reference: OSF DOI 10.17605/OSF.IO/ZDV9J, deviation log entry 2026-05-22 §9.2\n")
  cat("# Status: SUPPLEMENTARY EXPLORATORY — no decision rule promoted from BF or P(rho > 0).\n")
}

args <- commandArgs(trailingOnly = TRUE)
if (length(args) >= 1) {
  main(args[1])
} else {
  cat("Usage:\n")
  cat("  Rscript bayes_sensitivity.R <path/to/cohort_aggregates.csv>\n")
  cat("Companion smoke: Rscript bayes_sensitivity_smoke.R\n")
  quit(status = 2)
}
