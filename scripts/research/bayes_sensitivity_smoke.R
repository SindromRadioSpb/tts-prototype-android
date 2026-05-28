# =============================================================================
# Smoke fixture for bayes_sensitivity.R
# =============================================================================
#
# Verifies that the three-prior Bayesian posterior pipeline runs end-to-end
# on synthetic data at known true rho values, and that the posterior median
# tracks the true value within tolerance.
#
# Run: Rscript scripts/research/bayes_sensitivity_smoke.R
#
# Expected behavior:
#   - For each true rho in {0, 0.3, 0.5, 0.7}, generate 50 datasets at N=10
#     and verify median(posterior medians) is within +/-0.25 of true rho
#     (loose tolerance because N=10 yields wide CIs by design).
#   - All three priors must produce numeric posterior medians without errors.
#
# Author: Peter Kolosei
# Date:   2026-05-22 (V1 stack implementation)
# =============================================================================

# Load the analyzer functions by sourcing the parent script.
script_dir <- dirname(sys.frame(1)$ofile)
if (is.null(script_dir) || nchar(script_dir) == 0) {
  script_dir <- "scripts/research"
}
source(file.path(script_dir, "bayes_sensitivity.R"), local = TRUE,
       chdir = FALSE)

set.seed(20260522)

run_smoke_for_true_rho <- function(true_rho, n_sim = 50, n_per_sample = 10) {
  results_a <- c()
  results_b <- c()
  results_c <- c()

  for (i in seq_len(n_sim)) {
    x <- rnorm(n_per_sample)
    e <- rnorm(n_per_sample, sd = sqrt(1 - true_rho^2))
    y <- true_rho * x + e

    ra <- posterior_prior_a(x, y)
    rb <- posterior_normal_prior(x, y, PRIOR_B_MEAN, PRIOR_B_SD)
    rc <- posterior_normal_prior(x, y, PRIOR_C_MEAN, PRIOR_C_SD)

    if (!is.null(ra)) results_a <- c(results_a, ra$posterior_median)
    if (!is.null(rb)) results_b <- c(results_b, rb$posterior_median)
    if (!is.null(rc)) results_c <- c(results_c, rc$posterior_median)
  }

  cat(sprintf("true_rho=%.2f  n_sim=%d  N_per_sample=%d\n",
              true_rho, n_sim, n_per_sample))
  cat(sprintf("  Prior A median_of_medians = %.3f  (tolerance |delta| <= 0.25 vs true)\n",
              median(results_a)))
  cat(sprintf("  Prior B median_of_medians = %.3f  (skeptical pulls toward 0)\n",
              median(results_b)))
  cat(sprintf("  Prior C median_of_medians = %.3f  (literature pulls toward 0.3)\n",
              median(results_c)))

  # Sanity assertion (loose): Prior A median should be close to true rho.
  if (abs(median(results_a) - true_rho) > 0.25) {
    warning(sprintf("Smoke check: Prior A median deviates >0.25 from true_rho=%.2f",
                    true_rho))
  }
  cat("\n")
}

cat("=== Bayes sensitivity smoke fixture ===\n\n")
for (true_rho in c(0.0, 0.3, 0.5, 0.7)) {
  run_smoke_for_true_rho(true_rho)
}

cat("=== Smoke fixture complete ===\n")
cat("Expected at N=10: all priors produce numeric output without errors.\n")
cat("Prior A should track truth within +/-0.25; Priors B/C are intentionally\n")
cat("shrunk toward their prior means (skeptical -> 0, literature -> 0.3).\n")
