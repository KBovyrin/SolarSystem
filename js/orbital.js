(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Orbital = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DEG = Math.PI / 180;
  var DAY_MS = 86400000;
  var J2000_MS = 946728000000;               // 2000-01-01T12:00:00Z
  var J2000_DAYS = 10957.5;

  var A_AU = 1.000001018;                    // большая полуось, а.е.
  var ECC = 0.016708634;                     // эксцентриситет
  var MEAN_LON_0 = 280.460, MEAN_LON_RATE = 0.9856474;   // средняя долгота Солнца, °/день
  var MEAN_ANOM_0 = 357.528, MEAN_ANOM_RATE = 0.9856003; // средняя аномалия, °/день
  var VCIRC_1AU_KMS = 29.7847;               // круговая скорость на 1 а.е., км/с
  var AU_KM = 149.5978707;                   // а.е. в млн км

  function mod360(x) {
    var r = x % 360;
    return r < 0 ? r + 360 : r;
  }

  function daysSinceJ2000(date) {
    return date.getTime() / DAY_MS - J2000_DAYS;
  }

  // Уравнение Кеплера M = E - e·sinE, метод Ньютона
  function solveKepler(M, e) {
    var E = M;
    for (var i = 0; i < 30; i++) {
      var f = E - e * Math.sin(E) - M;
      var fp = 1 - e * Math.cos(E);
      var dE = f / fp;
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return E;
  }

  // Полное состояние Земли на дату: {lonSun (°), r (а.е.), E, M}
  function sunState(date) {
    var d = daysSinceJ2000(date);
    var L = mod360(MEAN_LON_0 + MEAN_LON_RATE * d);
    var M = mod360(MEAN_ANOM_0 + MEAN_ANOM_RATE * d);
    var E = solveKepler(M * DEG, ECC);
    var nu = 2 * Math.atan2(
      Math.sqrt(1 + ECC) * Math.sin(E / 2),
      Math.sqrt(1 - ECC) * Math.cos(E / 2)
    );
    var nuDeg = mod360(nu / DEG);
    var C = nuDeg - M;                       // истинное уравнение центра
    var lonSun = mod360(L + C);
    var r = A_AU * (1 - ECC * Math.cos(E));
    return { lonSun: lonSun, r: r };
  }

  function sunEclipticLongitude(date) {
    return sunState(date).lonSun;
  }

  function sunDistanceAU(date) {
    return sunState(date).r;
  }

  // Гелиоцентрическая позиция Земли, мировая рама:
  // x — долгота 0°, z — долгота 90°, y — север эклиптики; единицы — а.е.
  function earthPositionAU(date) {
    var s = sunState(date);
    var lonEarth = (s.lonSun + 180) * DEG;   // геоцентрич. Солнце + 180°
    return {
      x: s.r * Math.cos(lonEarth),
      y: 0,
      z: s.r * Math.sin(lonEarth)
    };
  }

  // Скорость Земли (vis-viva): v = v_круг(1 а.е.) · sqrt(2/r − 1/a)
  function earthSpeedKms(date) {
    var r = sunState(date).r;
    return VCIRC_1AU_KMS * Math.sqrt(2 / r - 1 / A_AU);
  }

  // ---------- Сезонность ----------

  var AXIAL_TILT_DEG = 23.44; // наклон оси Земли к эклиптике

  // Склонение Солнца: δ = asin(sin ε · sin λ_sun)
  function solarDeclinationDeg(date) {
    var sinDelta = Math.sin(AXIAL_TILT_DEG * DEG) * Math.sin(sunState(date).lonSun * DEG);
    return Math.asin(sinDelta) / DEG;
  }

  // Ось Земли фиксирована в мировых координатах (не вращается с орбитой).
  // Наклонена на AXIAL_TILT от НОРМАЛИ эклиптики (+Y) и направлена
  // на эклиптическую долготу 90° — туда, где Солнце в июньском солнцестоянии.
  function earthAxisDirection() {
    var t = AXIAL_TILT_DEG * DEG;
    return { x: 0, y: Math.cos(t), z: Math.sin(t) };
  }

  // Типовые границы астрономических сезонов (северное полушарие)
  function seasonBoundsUTC(year) {
    return {
      mar: Date.UTC(year, 2, 20),
      jun: Date.UTC(year, 5, 21),
      sep: Date.UTC(year, 8, 23),
      dec: Date.UTC(year, 11, 21)
    };
  }

  function seasonForDate(date) {
    var t = date.getTime();
    var year = date.getUTCFullYear();
    var b = seasonBoundsUTC(year);
    if (t < b.mar || t >= b.dec) return 'зима';
    if (t < b.jun) return 'весна';
    if (t < b.sep) return 'лето';
    return 'осень';
  }

  function seasonMarkers(year) {
    var b = seasonBoundsUTC(year);
    return [
      { date: new Date(b.mar), name: 'Весеннее равноденствие', season: 'весна' },
      { date: new Date(b.jun), name: 'Летнее солнцестояние', season: 'лето' },
      { date: new Date(b.sep), name: 'Осеннее равноденствие', season: 'осень' },
      { date: new Date(b.dec), name: 'Зимнее солнцестояние', season: 'зима' }
    ];
  }

  // Апсиды года: перигелий и афелий — экстремумы r из самой модели
  // (суточный скан года + часовое уточнение вокруг найденного дня)
  function apsisMarkers(year) {
    var start = Date.UTC(year, 0, 1);
    var end = Date.UTC(year + 1, 0, 1);
    var minT = start, maxT = start, minR = Infinity, maxR = -Infinity;
    for (var t = start; t < end; t += DAY_MS) {
      var r = sunDistanceAU(new Date(t));
      if (r < minR) { minR = r; minT = t; }
      if (r > maxR) { maxR = r; maxT = t; }
    }
    function refine(t0, wantMin) {
      var bestT = t0, bestR = sunDistanceAU(new Date(t0));
      for (var u = t0 - DAY_MS; u <= t0 + DAY_MS; u += 3600000) {
        var r = sunDistanceAU(new Date(u));
        if (wantMin ? r < bestR : r > bestR) { bestR = r; bestT = u; }
      }
      return { t: bestT, r: bestR };
    }
    var peri = refine(minT, true);
    var ape = refine(maxT, false);
    return [
      { date: new Date(peri.t), name: 'Перигелий', kind: 'perihelion', r: peri.r },
      { date: new Date(ape.t), name: 'Афелий', kind: 'aphelion', r: ape.r }
    ];
  }

  return {
    daysSinceJ2000: daysSinceJ2000,
    solveKepler: solveKepler,
    sunEclipticLongitude: sunEclipticLongitude,
    sunDistanceAU: sunDistanceAU,
    earthPositionAU: earthPositionAU,
    earthSpeedKms: earthSpeedKms,
    solarDeclinationDeg: solarDeclinationDeg,
    earthAxisDirection: earthAxisDirection,
    seasonForDate: seasonForDate,
    seasonMarkers: seasonMarkers,
    apsisMarkers: apsisMarkers,
    AU_KM: AU_KM,
    A_AU: A_AU,
    ECC: ECC,
    AXIAL_TILT_DEG: AXIAL_TILT_DEG
  };
});
