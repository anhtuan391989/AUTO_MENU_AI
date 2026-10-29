/**
 * Tự động hóa hành động dựa trên phân tích
 */
const RuleEngine = require("./RuleEngine");
const ConfidenceEngine = require("./ConfidenceEngine");
const DatabaseService = require("../services/DatabaseService");

class AutomationEngine {
  constructor() {
    this.contexts = new Map();
  }

  async process(songId, analysis) {
    let ctx = this.contexts.get(songId) || { attempts: 0, history: [] };
    
    ctx.attempts++;
    ctx.history.push({ key: analysis.key, mode: analysis.mode });
    ctx.confidence = ConfidenceEngine.calculate(
      ctx.history.map(h => h.key),
      analysis.key,
      analysis.energy || 0.5
    );

    const decision = RuleEngine.evaluate(ctx);

    switch (decision.action) {
      case "SUBMIT_KEY":
        await DatabaseService.submitVote(songId, analysis.key, analysis.mode, ctx.confidence);
        break;
      case "MARK_UNCERTAIN":
        console.log(`⚠️ Không đủ tin cậy cho bài ${songId}`);
        break;
    }

    this.contexts.set(songId, ctx);
    return { decision, context: ctx };
  }

  reset(songId) {
    this.contexts.delete(songId);
  }
}

module.exports = new AutomationEngine();