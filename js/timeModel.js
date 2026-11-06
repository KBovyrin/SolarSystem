(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TimeModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DAY_SEC = 86400; // сим-секунд в сутках

  function TimeModel(opts) {
    opts = opts || {};
    this.time = opts.startDate !== undefined ? new Date(opts.startDate).getTime() : Date.now();
    this.speed = opts.speed !== undefined ? opts.speed : DAY_SEC; // сим-секунд на реальную секунду
    this.paused = false;
  }

  TimeModel.prototype.getDate = function () { return new Date(this.time); };
  TimeModel.prototype.getSpeed = function () { return this.speed; };
  TimeModel.prototype.setSpeed = function (simSecondsPerSecond) {
    if (typeof simSecondsPerSecond === 'number' && isFinite(simSecondsPerSecond) && simSecondsPerSecond > 0) {
      this.speed = simSecondsPerSecond;
    }
  };
  TimeModel.prototype.pause = function () { this.paused = true; };
  TimeModel.prototype.play = function () { this.paused = false; };
  TimeModel.prototype.isPaused = function () { return this.paused; };
  TimeModel.prototype.tick = function (dtSeconds) {
    if (!this.paused) this.time += this.speed * 1000 * dtSeconds;
    return this.getDate();
  };

  return TimeModel;
});
