const osc = require('osc'); // npm install osc
const BaseDriver = require('./baseDriver');

class OscDriver extends BaseDriver {
  constructor(host = '127.0.0.1', port = 11000) {
    super('osc');
    this.port = new osc.UDPPort({
      localAddress: '0.0.0.0',
      localPort: 0,
      remoteAddress: host,
      remotePort: port,
    });
    this.port.open();
  }

  async execute(params) {
    // params: { address: '/live/song/set/tempo', value: 128 }
    try {
      this.port.send({
        address: params.address,
        args: params.value !== undefined ? [{ type: 'f', value: params.value }] : [],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  }
}

module.exports = OscDriver;
