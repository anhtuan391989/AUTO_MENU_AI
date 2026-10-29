/**
 * Quyết định hành động
 */
class Decision {
  constructor(type, data, confidence = 1.0) {
    this.type = type;
    this.data = data;
    this.confidence = confidence;
    this.timestamp = Date.now();
    this.executed = false;
  }

  execute() {
    this.executed = true;
    return this.data;
  }

  toJSON() {
    return {
      type: this.type,
      data: this.data,
      confidence: this.confidence,
      timestamp: this.timestamp,
      executed: this.executed
    };
  }
}

module.exports = Decision;