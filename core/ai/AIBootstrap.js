const AIBrain = require("./AIBrain");
<<<<<<< HEAD
 HEAD
const WorkflowManager = require("./managers/WorkflowManager");
const WorkflowManager = require("./managers/WorkflowManager"); // LƯU Ý: trỏ tới file RỖNG (0 byte), trùng tên với ./workflow/WorkflowManager.js bên dưới — vấn đề trùng tên đã biết từ báo cáo audit trước, CHƯA xử lý trong nhiệm vụ này (ngoài phạm vi được giao)
 origin/main
=======
const WorkflowManager = require("./managers/WorkflowManager"); // LƯU Ý: trỏ tới file RỖNG (0 byte), trùng tên với ./workflow/WorkflowManager.js bên dưới — vấn đề trùng tên đã biết từ báo cáo audit trước, CHƯA xử lý trong nhiệm vụ này (ngoài phạm vi được giao)
>>>>>>> 98e2c92 (Auto-sync 23/07/2026 12:35:35,71)
const DecisionEngine = require("./decision/DecisionEngine");
const EventBus = require("../events/EventBus");
const Context = require("./AIContext");
const AnalysisState = require("./AnalysisState"); // require để kích hoạt lắng nghe KEY/BPM/MOD_UPDATED (xem AnalysisState.js)
const InferenceEngine = require("./inference/InferenceEngine"); // require để kích hoạt lắng nghe KEY_CHANGED/BPM_CHANGED/MOD_CHANGED (xem InferenceEngine.js)
const ResultQueue = require("./aggregation/ResultQueue"); // require để kích hoạt lắng nghe ANALYSIS_RESULT (xem ResultQueue.js)
const WorkflowEngine = require("./workflow/WorkflowManager"); // require để kích hoạt lắng nghe DECISION_READY (xem workflow/WorkflowManager.js) — file THẬT của nhiệm vụ Workflow Engine, khác với require("./managers/WorkflowManager") rỗng ở trên

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

}

module.exports = new AIBootstrap();
