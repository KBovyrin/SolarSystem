// Node-раннер тех же тестов: node tests/run.js
// (в окружении без node используется tests.html в браузере)
function load(path) {
  try { return require(path); }
  catch (e) {
    console.log('FAIL загрузка ' + path + ' :: ' + e.message);
    return null;
  }
}
var runSuite = load('./suite.js');
var summary = runSuite && runSuite.runSuite({
  TimeModel: load('../js/timeModel.js'),
  Orbital: load('../js/orbital.js'),
  Kepler: load('../js/kepler.js'),
  Bodies: load('../js/bodies.js'),
  Scales: load('../js/scales.js'),
  AppUI: load('../js/ui.js')
}, function (l) { console.log(l); });
process.exitCode = summary.failed === 0 ? 0 : 1;
