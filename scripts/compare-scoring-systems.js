#!/usr/bin/env node

/**
 * Scoring System Comparison Script
 *
 * Analyzes audit log and compares the current SignalGenerator scoring
 * with the normalized SignalNormalizer scoring system to evaluate
 * the impact of conservative multipliers and priority hierarchy.
 *
 * Usage:
 *   node scripts/compare-scoring-systems.js [options]
 *
 * Options:
 *   --audit-log <path>     Path to audit log (default: cypherscoping-agent/runtime/audit.log)
 *   --output <path>        Output file for comparison report (default: stdout)
 *   --format <type>        Output format: json, table (default: table)
 *   --min-samples <n>      Minimum sample size for full metrics (default: 10)
 */

const fs = require("fs");
const path = require("path");

class ScoringSystemComparison {
  constructor(auditLogPath) {
    this.auditLogPath = auditLogPath;
    this.comparisons = [];
  }

  async parseAuditLog() {
    if (!fs.existsSync(this.auditLogPath)) {
      console.log("No comparison data found");
      console.log(`Audit log not found: ${this.auditLogPath}`);
      return;
    }

    const readline = require("readline");
    const rl = readline.createInterface({
      input: fs.createReadStream(this.auditLogPath, "utf-8"),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        if (entry.eventType === "parallel_score_comparison") {
          this.recordComparison(entry);
        }
      } catch (error) {
        continue;
      }
    }

    if (this.comparisons.length === 0) {
      console.log("No comparison data found");
      console.log(
        "Run the signal analysis with ENABLE_SIGNAL_NORMALIZER=true to generate comparison data.",
      );
    }
  }

  recordComparison(entry) {
    const {
      currentScore,
      normalizedScore,
      currentTier,
      normalizedTier,
      agreement,
    } = entry.payload;

    this.comparisons.push({
      currentScore,
      normalizedScore,
      currentTier,
      normalizedTier,
      agreement,
    });
  }

  calculateCorrelation() {
    const n = this.comparisons.length;
    if (n === 0) return 0;

    const currentScores = this.comparisons.map((c) => c.currentScore);
    const normalizedScores = this.comparisons.map((c) => c.normalizedScore);

    const meanCurrent =
      currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
    const meanNormalized =
      normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length;

    let numerator = 0;
    let denomCurrentSq = 0;
    let denomNormalizedSq = 0;

    for (let i = 0; i < n; i++) {
      const diffCurrent = currentScores[i] - meanCurrent;
      const diffNormalized = normalizedScores[i] - meanNormalized;

      numerator += diffCurrent * diffNormalized;
      denomCurrentSq += diffCurrent * diffCurrent;
      denomNormalizedSq += diffNormalized * diffNormalized;
    }

    const denominator = Math.sqrt(denomCurrentSq * denomNormalizedSq);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  calculateTierAgreement() {
    if (this.comparisons.length === 0) return 0;

    const agreementCount = this.comparisons.filter((c) => c.agreement).length;
    return (agreementCount / this.comparisons.length) * 100;
  }

  calculateMeanAbsoluteDifference() {
    if (this.comparisons.length === 0) return 0;

    const sumAbsDiff = this.comparisons.reduce(
      (sum, c) => sum + Math.abs(c.currentScore - c.normalizedScore),
      0,
    );

    return sumAbsDiff / this.comparisons.length;
  }

  calculateTradeDecisionDivergences(threshold = 75) {
    if (this.comparisons.length === 0) return { count: 0, examples: [] };

    const divergences = [];

    for (const c of this.comparisons) {
      const currentWouldTrade = Math.abs(c.currentScore) >= threshold;
      const normalizedWouldTrade = Math.abs(c.normalizedScore) >= threshold;

      if (currentWouldTrade !== normalizedWouldTrade) {
        divergences.push({
          currentScore: c.currentScore,
          normalizedScore: c.normalizedScore,
          currentWouldTrade,
          normalizedWouldTrade,
        });
      }
    }

    return {
      count: divergences.length,
      examples: divergences.slice(0, 5),
    };
  }

  generateReport(format = "table") {
    const n = this.comparisons.length;

    if (n === 0) {
      return;
    }

    const metrics = {
      sampleSize: n,
      scoreCorrelation: this.calculateCorrelation(),
      tierAgreementPercent: this.calculateTierAgreement(),
      meanAbsoluteDifference: this.calculateMeanAbsoluteDifference(),
      tradeDecisionDivergences: this.calculateTradeDecisionDivergences(),
    };

    if (format === "json") {
      console.log(JSON.stringify(metrics, null, 2));
      return;
    }

    console.log("\n=== Scoring System Comparison Report ===\n");

    if (n < 10) {
      console.log(
        `⚠️  WARNING: Small sample size (${n} comparisons). Results may not be statistically significant.\n`,
      );
    }

    console.log(`Sample Size: ${metrics.sampleSize} comparisons`);
    console.log(
      `Score Correlation: ${metrics.scoreCorrelation.toFixed(3)} (${this.interpretCorrelation(metrics.scoreCorrelation)})`,
    );
    console.log(`Tier Agreement: ${metrics.tierAgreementPercent.toFixed(1)}%`);
    console.log(
      `Mean Absolute Difference: ${metrics.meanAbsoluteDifference.toFixed(2)} points`,
    );

    console.log(
      `\nTrade Decision Divergences: ${metrics.tradeDecisionDivergences.count} cases (${((metrics.tradeDecisionDivergences.count / n) * 100).toFixed(1)}%)`,
    );

    if (metrics.tradeDecisionDivergences.count > 0) {
      console.log("\nExample Divergences (first 5):");
      for (const ex of metrics.tradeDecisionDivergences.examples) {
        console.log(
          `  Current: ${ex.currentScore.toFixed(1)} (${ex.currentWouldTrade ? "TRADE" : "SKIP"}) | Normalized: ${ex.normalizedScore.toFixed(1)} (${ex.normalizedWouldTrade ? "TRADE" : "SKIP"})`,
        );
      }
    }

    console.log("\n");
  }

  interpretCorrelation(r) {
    const absR = Math.abs(r);
    if (absR >= 0.9) return "very strong";
    if (absR >= 0.7) return "strong";
    if (absR >= 0.5) return "moderate";
    if (absR >= 0.3) return "weak";
    return "very weak";
  }
}

const args = process.argv.slice(2);
const options = {
  auditLog:
    args.find((arg, i) => args[i - 1] === "--audit-log") ||
    "cypherscoping-agent/runtime/audit.log",
  output: args.find((arg, i) => args[i - 1] === "--output"),
  format: args.find((arg, i) => args[i - 1] === "--format") || "table",
  minSamples:
    parseInt(args.find((arg, i) => args[i - 1] === "--min-samples")) || 10,
};

const comparison = new ScoringSystemComparison(options.auditLog);
(async () => {
  await comparison.parseAuditLog();
  comparison.generateReport(options.format);
})();
