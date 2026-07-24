const AIBrain = require("./AIBrain");
// LƯU Ý: đã bỏ dòng require trỏ tới core/ai/managers/WorkflowManager.js (file RỖNG
// 0 byte, trùng tên với core/ai/workflow/WorkflowManager.js) vì biến đó chưa từng
// được dùng ở đâu trong file này — chỉ "WorkflowEngine" (dòng dưới, trỏ tới file
// workflow/WorkflowManager.js, bản THẬT) mới thực sự được dùng qua getWorkflowEngine().
// Xoá dòng require thừa này không đổi hành vi hệ thống.
const DecisionEngine = require("./decision/DecisionEngine");
const EventBus = require("../events/EventBus");
const Context = require("./AIContext");
const AnalysisState = require("./AnalysisState"); // require để kích hoạt lắng nghe KEY/BPM/MOD_UPDATED (xem AnalysisState.js)
const InferenceEngine = require("./inference/InferenceEngine"); // require để kích hoạt lắng nghe KEY_CHANGED/BPM_CHANGED/MOD_CHANGED (xem InferenceEngine.js)
const ResultQueue = require("./aggregation/ResultQueue"); // require để kích hoạt lắng nghe ANALYSIS_RESULT (xem ResultQueue.js)
const WorkflowEngine = require("./workflow/WorkflowManager"); // require để kích hoạt lắng nghe DECISION_READY (xem workflow/WorkflowManager.js) — file THẬT của nhiệm vụ Workflow Engine, khác với require("./managers/WorkflowManager") rỗng ở trên
const PluginController = require("./plugin/PluginController"); // require để kích hoạt lắng nghe WORKFLOW_READY (xem plugin/PluginController.js) — mắt xích cuối, chỉ phát PLUGIN_COMMAND khi ControlSource = AI_CONTROL; mặc định LEGACY_CONTROL nên chỉ quan sát/log, không gửi lệnh, không đổi hành vi hệ thống hiện tại

class AIBootstrap {

    constructor() {

        this.ai = null;

        this.initialized = false;

    }

    async initialize() {

        if (this.initialized) return;

        this.ai = new AIBrain();

        await this.ai.init();

        this.initialized = true;

        console.log("AI Bootstrap Ready");

    }

    getBrain() {

        return this.ai;

    }

    getAnalysisState() {

        return AnalysisState;

    }

    getInferenceEngine() {

        return InferenceEngine;

    }

    getResultQueue() {

        return ResultQueue;

    }

    getDecisionEngine() {

        return DecisionEngine;

    }

    getWorkflowEngine() {

        return WorkflowEngine;

    }

    getPluginController() {

        return PluginController;

    }

}

module.exports = new AIBootstrap();
