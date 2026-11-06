(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./orbital.js'), require('./kepler.js'), require('./bodies.js'));
  else root.AppUI = factory(root.Orbital, root.Kepler, root.Bodies);
})(typeof self !== 'undefined' ? self : this, function (Orbital, Kepler, Bodies) {
  var SPEED_MIN = 60;        // 1 минута в секунду
  var SPEED_MAX = 31557600;  // 1 год (365,25 суток) в секунду
  var SLIDER_MAX = 1000;
  var YEAR_DAYS = 365.25;    // юлианский год
  var MONTH_SEC = 2592000;   // 30 суток

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatDateRu(date) {
    return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear() +
      ', ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function trimNum(x) {
    var s = String(Math.round(x * 10) / 10).replace('.', ',');
    return s.replace(/,0$/, '');
  }

  // Русская плюрализация: один / два-четыре / прочие
  function pluralRu(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  // «1 год», «2 года», «11,9 года», «165 лет» (дробные — всегда «года»)
  function formatYears(x) {
    var s = trimNum(x);
    if (s.indexOf(',') !== -1) return s + ' года';
    return s + ' ' + pluralRu(parseInt(s, 10), 'год', 'года', 'лет');
  }

  function formatSpeed(simSecondsPerSecond) {
    var v = simSecondsPerSecond;
    if (v < 3600) return trimNum(v / 60) + ' мин/с';
    if (v < 86400) return trimNum(v / 3600) + ' ч/с';
    if (v < MONTH_SEC) return trimNum(v / 86400) + ' дн/с';
    if (v < SPEED_MAX) return trimNum(v / MONTH_SEC) + ' мес/с';
    return formatYears(v / SPEED_MAX) + '/с';
  }

  function formatPeriod(days) {
    if (days < YEAR_DAYS) return trimNum(days) + ' дн';
    return formatYears(days / YEAR_DAYS);
  }

  function formatSunDistance(rAU) {
    return rAU.toFixed(3).replace('.', ',') + ' а.е. · ' +
      (rAU * Orbital.AU_KM).toFixed(1).replace('.', ',') + ' млн км';
  }

  function formatEarthSpeed(vKms) {
    return vKms.toFixed(1).replace('.', ',') + ' км/с';
  }

  // Строка состояния планеты на дату (без DOM): «Марс · 1,482 а.е. · … млн км · … км/с · период …»
  function planetStateText(bodyId, date) {
    var p = Bodies.bodyById(bodyId);
    if (!p) return '';
    var pos = Kepler.positionAU(p.orbit, date);
    var r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    var v = Kepler.speedKms(p.orbit, date);
    return p.name + ' · ' + formatSunDistance(r) + ' · ' + formatEarthSpeed(v) +
      ' · период ' + formatPeriod(p.periodDays);
  }

  function sliderToSpeed(v) {
    var t = Math.max(0, Math.min(SLIDER_MAX, v)) / SLIDER_MAX;
    return SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, t);
  }

  function speedToSlider(s) {
    return SLIDER_MAX * Math.log(s / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN);
  }

  function createApp(opts) {
    var tm = opts.timeModel;
    var scene = opts.scene;
    var els = opts.elements;
    var selectedBody = 'earth';

    // селектор: Солнце + 8 планет + карликовые (Плутон), по умолчанию Земля
    if (els.planet) {
      var dwarfSet = {};
      (Bodies.dwarfs || []).forEach(function (d) { dwarfSet[d.id] = true; });
      var sunOption = document.createElement('option');
      sunOption.value = 'sun';
      sunOption.textContent = 'Солнце';
      els.planet.appendChild(sunOption);
      Bodies.planets.concat(Bodies.dwarfs || []).forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + (dwarfSet[p.id] ? ' (карликовая)' : '');
        els.planet.appendChild(opt);
      });
      els.planet.value = selectedBody;
      els.planet.addEventListener('input', function () {
        selectedBody = els.planet.value;
        scene.setTarget(selectedBody);
        refresh();
      });
    }

    function refreshState(date) {
      els.date.textContent = formatDateRu(date);
      if (selectedBody === 'earth') {
        // ядро урока о Земле: сезон и живой индикатор из модели Orbital
        els.season.textContent = Orbital.seasonForDate(date);
        els.distance.textContent = formatSunDistance(Orbital.sunDistanceAU(date)) +
          ' · ' + formatEarthSpeed(Orbital.earthSpeedKms(date));
      } else {
        els.season.textContent = '';
        els.distance.textContent = selectedBody === 'sun'
          ? 'Солнце — центр системы'
          : planetStateText(selectedBody, date);
      }
    }

    function refresh() {
      refreshState(tm.getDate());
    }

    function tick(dtSeconds) {
      var date = tm.tick(dtSeconds);
      scene.update(date);
      scene.render();
      refreshState(date);
    }

    function refreshSpeedLabel() {
      els.speedLabel.textContent = formatSpeed(tm.getSpeed());
    }

    function setPaused(paused) {
      if (paused) { tm.pause(); els.pause.textContent = '▶ Продолжить'; }
      else { tm.play(); els.pause.textContent = '⏸ Пауза'; }
    }

    els.pause.addEventListener('click', function () {
      setPaused(!tm.isPaused());
      refresh();
    });

    els.speed.addEventListener('input', function () {
      tm.setSpeed(sliderToSpeed(parseFloat(els.speed.value)));
      refreshSpeedLabel();
    });

    els.camOverview.addEventListener('click', function () { scene.setCameraPreset('overview'); });
    els.camSide.addEventListener('click', function () { scene.setCameraPreset('side'); });
    els.camTop.addEventListener('click', function () { scene.setCameraPreset('top'); });

    window.addEventListener('resize', function () { scene.resize(); });

    // начальное состояние
    els.speed.value = speedToSlider(tm.getSpeed());
    refreshSpeedLabel();
    setPaused(false);
    refresh();

    return {
      tick: tick,
      refresh: refresh
    };
  }

  return {
    formatDateRu: formatDateRu,
    formatSpeed: formatSpeed,
    formatPeriod: formatPeriod,
    formatSunDistance: formatSunDistance,
    formatEarthSpeed: formatEarthSpeed,
    planetStateText: planetStateText,
    sliderToSpeed: sliderToSpeed,
    speedToSlider: speedToSlider,
    createApp: createApp,
    SPEED_MIN: SPEED_MIN,
    SPEED_MAX: SPEED_MAX
  };
});
