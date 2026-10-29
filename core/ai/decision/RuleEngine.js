/**
 * Áp dụng quy tắc ra quyết định
 */
const SettingService = require("../services/SettingService");

class RuleEngine {
  constructor() {
    this.rules = [];
    this._initDefaultRules();
  }

  _initDefaultRules() {
    this.rules = [
      {
        id: "submit_key",
        condition: (ctx) => ctx.confidence >= SettingService.get("minConfidence"),
        action: "SUBMIT_KEY"
      },
      {
        id: "wait_more",
        condition: (ctx) => ctx.confidence < SettingService.get("minConfidence") && ctx.attempts < 3,
        action: "COLLECT_MORE"
      },
      {
        id: "mark_uncertain",
        condition: (ctx) => ctx.attempts >= 3,
        action: "MARK_UNCERTAIN"
      }
    ];
  }

  evaluate(context) {
    for (const rule of this.rules) {
      if (rule.condition(context)) {
        return { action: rule.action, ruleId: rule.id };
      }
    }
    return { action: "NO_OP" };
  }
}

module.exports = new RuleEngine();