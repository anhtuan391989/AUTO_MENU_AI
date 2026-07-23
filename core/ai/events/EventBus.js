const Context = require("./AIContext");
const STATES = require("./StateMachine");

class AIBrain {

    constructor(){

        this.context = Context;

        this.state = STATES.BOOT;

    }

    async initialize(){

        this.state = STATES.READY;

        this.context.app.status = STATES.READY;

    }

}

module.exports = AIBrain;