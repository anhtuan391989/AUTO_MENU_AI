/**
 * Theo dõi thay đổi Dự án
 */
const EventEmitter = require('events');

class ProjectListener extends EventEmitter {
  constructor() {
    super();
    this.currentProject = null;
  }

  open(projectInfo) {
    this.currentProject = projectInfo;
    this.emit('project_opened', projectInfo);
  }

  close() {
    const prev = this.currentProject;
    this.currentProject = null;
    this.emit('project_closed', prev);
  }

  save() {
    this.emit('project_saved', this.currentProject);
  }

  getCurrent() {
    return this.currentProject;
  }
}

module.exports = new ProjectListener();