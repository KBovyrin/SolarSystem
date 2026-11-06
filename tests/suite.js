(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TestSuite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function assertClose(actual, expected, tol, msg) {
    if (!(Math.abs(actual - expected) <= tol)) {
      throw new Error((msg || '') + ' ожидалось ' + expected + '±' + tol + ', получено ' + actual);
    }
  }

  function timeModelSuite(test, TimeModel) {
    var DAY_MS = 86400000;
    var START = new Date(Date.UTC(2026, 2, 20, 12, 0, 0)); // 20.03.2026 12:00 UTC

    test('старт с заданной даты', function () {
      var tm = new TimeModel({ startDate: START });
      assert(tm.getDate().getTime() === START.getTime(),
        'дата старта ' + tm.getDate().toISOString() + ' != ' + START.toISOString());
    });

    test('дефолтная скорость = 1 сутки/с: tick(1) двигает ровно на сутки', function () {
      var tm = new TimeModel({ startDate: START });
      var d = tm.tick(1);
      assert(d.getTime() - START.getTime() === DAY_MS,
        'сдвиг ' + (d.getTime() - START.getTime()) + ' мс != ' + DAY_MS);
    });

    test('tick пропорционален dt', function () {
      var tm = new TimeModel({ startDate: START });
      var d = tm.tick(0.5);
      assert(d.getTime() - START.getTime() === DAY_MS / 2, 'tick(0.5) сдвинул на ' + (d.getTime() - START.getTime()));
    });

    test('пауза замораживает время', function () {
      var tm = new TimeModel({ startDate: START });
      tm.tick(1);
      var frozen = tm.getDate().getTime();
      tm.pause();
      tm.tick(100);
      assert(tm.getDate().getTime() === frozen, 'после pause время изменилось');
    });

    test('play возобновляет движение', function () {
      var tm = new TimeModel({ startDate: START });
      tm.pause();
      tm.tick(10);
      var frozen = tm.getDate().getTime();
      tm.play();
      tm.tick(2);
      assert(tm.getDate().getTime() === frozen + 2 * DAY_MS, 'после play время не пошло корректно');
    });

    test('setSpeed меняет темп', function () {
      var tm = new TimeModel({ startDate: START });
      tm.setSpeed(60); // 1 минута/с
      var d = tm.tick(1);
      assert(d.getTime() - START.getTime() === 60000, 'tick при скорости 60 сдвинул на ' + (d.getTime() - START.getTime()));
    });

    test('setSpeed игнорирует неположительные значения', function () {
      var tm = new TimeModel({ startDate: START });
      tm.setSpeed(3600);
      tm.setSpeed(0);
      assert(tm.getSpeed() === 3600, 'setSpeed(0) изменил скорость');
      tm.setSpeed(-5);
      assert(tm.getSpeed() === 3600, 'setSpeed(-5) изменил скорость');
    });

    test('tick возвращает Date, равный внутреннему времени', function () {
      var tm = new TimeModel({ startDate: START });
      var d1 = tm.tick(3);
      var d2 = tm.getDate();
      assert(d1 instanceof Date && d1.getTime() === d2.getTime(), 'tick/getDate расходятся');
    });
  }

  function orbitalSuite(test, Orbital) {
    var DEG = Math.PI / 180;
    var EARTH_E = 0.016708634;
    var Y2026 = Date.UTC(2026, 0, 1);

    function scanYear(stepDays, fn) {
      for (var t = Y2026; t < Date.UTC(2027, 0, 1); t += stepDays * 86400000) fn(new Date(t), t);
    }

    test('Кеплер: решение удовлетворяет уравнению M = E - e·sin E', function () {
      var Ms = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI, 1.25 * Math.PI, 1.75 * Math.PI];
      for (var i = 0; i < Ms.length; i++) {
        var M = Ms[i], E = Orbital.solveKepler(M, EARTH_E);
        var residual = Math.abs((E - EARTH_E * Math.sin(E)) - M);
        assert(residual < 1e-9, 'остаток уравнения Кеплера ' + residual + ' при M=' + M);
        assert(Math.abs(E - M) <= Math.PI + 1e-9, 'E не в ветви M: |E-M|=' + Math.abs(E - M));
      }
    });

    test('Кеплер: M=0 даёт E=0 (перигелий)', function () {
      assert(Orbital.solveKepler(0, EARTH_E) === 0, 'E(0) != 0');
    });

    test('расстояние Земля-Солнце весь год в [0.982, 1.019] а.е.', function () {
      scanYear(5, function (date) {
        var r = Orbital.sunDistanceAU(date);
        assert(r > 0.982 && r < 1.019, 'r=' + r + ' а.е. на ' + date.toISOString().slice(0, 10));
      });
    });

    test('перигелий ~январь, афелий ~июль', function () {
      var minT = 0, maxT = 0, minR = Infinity, maxR = -Infinity;
      scanYear(1, function (date, t) {
        var r = Orbital.sunDistanceAU(date);
        if (r < minR) { minR = r; minT = t; }
        if (r > maxR) { maxR = r; maxT = t; }
      });
      var minMonth = new Date(minT).getUTCMonth();
      var maxMonth = new Date(maxT).getUTCMonth();
      assert(minMonth === 0, 'минимум не в январе: ' + new Date(minT).toISOString());
      assert(maxMonth === 6, 'максимум не в июле: ' + new Date(maxT).toISOString());
    });

    test('vis-viva: скорость в перигелии выше, чем в афелии, обе ~29-31 км/с', function () {
      var minT = 0, maxT = 0, minR = Infinity, maxR = -Infinity;
      scanYear(1, function (date, t) {
        var r = Orbital.sunDistanceAU(date);
        if (r < minR) { minR = r; minT = t; }
        if (r > maxR) { maxR = r; maxT = t; }
      });
      var vPeri = Orbital.earthSpeedKms(new Date(minT));
      var vApe = Orbital.earthSpeedKms(new Date(maxT));
      assert(vPeri > vApe, 'v_peri=' + vPeri + ' не больше v_ape=' + vApe);
      assert(vPeri > 29.0 && vPeri < 30.6, 'v_peri=' + vPeri + ' вне диапазона');
      assert(vApe > 29.0 && vApe < 30.6, 'v_ape=' + vApe + ' вне диапазона');
      assertClose(vPeri / vApe, 1.034, 0.006, 'отношение скоростей');
    });

    test('позиция детерминирована и |pos| = r', function () {
      var date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
      var p1 = Orbital.earthPositionAU(date);
      var p2 = Orbital.earthPositionAU(date);
      assert(p1.x === p2.x && p1.y === p2.y && p1.z === p2.z, 'позиция недетерминирована');
      var r = Math.sqrt(p1.x * p1.x + p1.y * p1.y + p1.z * p1.z);
      assertClose(r, Orbital.sunDistanceAU(date), 1e-9, '|pos| != r');
      assertClose(p1.y, 0, 1e-9, 'орбита не в плоскости y=0');
    });

    test('непрерывность: за час Земля смещается меньше 0.0009 а.е.', function () {
      var t = Date.UTC(2026, 8, 23, 0, 0, 0);
      var p1 = Orbital.earthPositionAU(new Date(t));
      var p2 = Orbital.earthPositionAU(new Date(t + 3600000));
      var dx = p2.x - p1.x, dz = p2.z - p1.z;
      var moved = Math.sqrt(dx * dx + dz * dz);
      assert(moved > 0 && moved < 0.0009, 'смещение за час = ' + moved + ' а.е.');
    });

    test('долгота Солнца периодична с периодом ~год', function () {
      var t = Date.UTC(2026, 2, 20, 12, 0, 0);
      var l1 = Orbital.sunEclipticLongitude(new Date(t));
      var l2 = Orbital.sunEclipticLongitude(new Date(t + 365.25 * 86400000));
      var diff = Math.abs(l1 - l2);
      diff = Math.min(diff, 360 - diff);
      assert(diff < 0.5, 'расхождение долготы за год ' + diff + '°');
    });
  }

  function apsisSuite(test, Orbital) {
    function dotUnit(a, b) {
      var la = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      var lb = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
      return (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
    }

    test('AU_KM: астрономическая единица в млн км', function () {
      assertClose(Orbital.AU_KM, 149.5978707, 1e-6, 'AU_KM');
    });

    test('апсиды 2026: перигелий в начале января, афелий в начале июля', function () {
      var aps = Orbital.apsisMarkers(2026);
      assert(aps.length === 2, 'маркеров ' + aps.length);
      var peri = aps[0], ape = aps[1];
      assert(peri.kind === 'perihelion', 'первый маркер не перигелий');
      assert(ape.kind === 'aphelion', 'второй маркер не афелий');
      assert(typeof peri.name === 'string' && peri.name.length > 0, 'нет имени у перигелия');
      assert(typeof ape.name === 'string' && ape.name.length > 0, 'нет имени у афелия');
      assert(peri.date.getUTCFullYear() === 2026, 'год перигелия');
      assert(ape.date.getUTCFullYear() === 2026, 'год афелия');
      assert(peri.date.getUTCMonth() === 0 && peri.date.getUTCDate() >= 1 && peri.date.getUTCDate() <= 7,
        'перигелий не в 1–7 января: ' + peri.date.toISOString());
      assert(ape.date.getUTCMonth() === 6 && ape.date.getUTCDate() >= 2 && ape.date.getUTCDate() <= 8,
        'афелий не в 2–8 июля: ' + ape.date.toISOString());
    });

    test('апсиды: r ≈ a(1−e) = 0,9833 а.е. (147,1 млн км) и a(1+e) = 1,0167 а.е. (152,1 млн км)', function () {
      var aps = Orbital.apsisMarkers(2026);
      var rPeri = Orbital.sunDistanceAU(aps[0].date);
      var rApe = Orbital.sunDistanceAU(aps[1].date);
      assertClose(rPeri, 0.9833, 0.0004, 'r перигелия');
      assertClose(rApe, 1.0167, 0.0004, 'r афелия');
      assertClose(rPeri * Orbital.AU_KM, 147.1, 0.15, 'перигелий в млн км');
      assertClose(rApe * Orbital.AU_KM, 152.1, 0.15, 'афелий в млн км');
      // локальный экстремум: в ±5 дней r дальше от экстремума
      var DAY = 86400000;
      var rPeriBefore = Orbital.sunDistanceAU(new Date(aps[0].date.getTime() - 5 * DAY));
      var rPeriAfter = Orbital.sunDistanceAU(new Date(aps[0].date.getTime() + 5 * DAY));
      assert(rPeri < rPeriBefore && rPeri < rPeriAfter,
        'перигелий не локальный минимум: ' + rPeriBefore.toFixed(5) + ' / ' + rPeri + ' / ' + rPeriAfter.toFixed(5));
      var rApeBefore = Orbital.sunDistanceAU(new Date(aps[1].date.getTime() - 5 * DAY));
      var rApeAfter = Orbital.sunDistanceAU(new Date(aps[1].date.getTime() + 5 * DAY));
      assert(rApe > rApeBefore && rApe > rApeAfter,
        'афелий не локальный максимум: ' + rApeBefore.toFixed(5) + ' / ' + rApe + ' / ' + rApeAfter.toFixed(5));
    });

    test('апсиды: позиции перигелия и афелия противоположны (концы большой оси)', function () {
      var aps = Orbital.apsisMarkers(2026);
      var d = dotUnit(Orbital.earthPositionAU(aps[0].date), Orbital.earthPositionAU(aps[1].date));
      assert(d < -0.999, 'dot=' + d);
    });

    test('апсиды: центр эллипса (середина апсид) смещён от Солнца на a·e ≈ 0,0167 а.е.', function () {
      var aps = Orbital.apsisMarkers(2026);
      var p1 = Orbital.earthPositionAU(aps[0].date);
      var p2 = Orbital.earthPositionAU(aps[1].date);
      var cx = (p1.x + p2.x) / 2, cz = (p1.z + p2.z) / 2;
      var dist = Math.sqrt(cx * cx + cz * cz);
      assertClose(dist, Orbital.A_AU * Orbital.ECC, 0.002, 'смещение центра');
    });
  }

  function seasonSuite(test, Orbital) {
    function dotUnit(a, b) {
      var la = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      var lb = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
      return (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
    }
    function sunDirectionFromEarth(date) {
      var p = Orbital.earthPositionAU(date);
      var len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      return { x: -p.x / len, y: -p.y / len, z: -p.z / len };
    }

    test('склонение Солнца ≈ 0 в равноденствия (20.03 и 23.09.2026)', function () {
      var d1 = Orbital.solarDeclinationDeg(new Date(Date.UTC(2026, 2, 20, 14, 46)));
      var d2 = Orbital.solarDeclinationDeg(new Date(Date.UTC(2026, 8, 23, 0, 5)));
      assert(Math.abs(d1) < 1.0, 'δ(20.03.2026)=' + d1 + '°');
      assert(Math.abs(d2) < 1.0, 'δ(23.09.2026)=' + d2 + '°');
    });

    test('склонение ≈ +23.44° в июньском солнцестоянии, ≈ −23.44° в декабрьском', function () {
      var dj = Orbital.solarDeclinationDeg(new Date(Date.UTC(2026, 5, 21, 8, 25)));
      var dd = Orbital.solarDeclinationDeg(new Date(Date.UTC(2026, 11, 21, 15, 50)));
      assert(dj > 22.9 && dj < 23.5, 'δ(21.06.2026)=' + dj + '°');
      assert(dd < -22.9 && dd > -23.5, 'δ(21.12.2026)=' + dd + '°');
    });

    test('склонение весь год в пределах ±23.45°', function () {
      for (var t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 5 * 86400000) {
        var d = Orbital.solarDeclinationDeg(new Date(t));
        assert(Math.abs(d) <= 23.45, 'δ=' + d + '° на ' + new Date(t).toISOString().slice(0, 10));
      }
    });

    test('ось Земли: единичный вектор, фиксирована, наклон 23.44° от нормали эклиптики, север сверху', function () {
      var a1 = Orbital.earthAxisDirection();
      var a2 = Orbital.earthAxisDirection();
      assert(a1.x === a2.x && a1.y === a2.y && a1.z === a2.z, 'ось меняется между вызовами');
      var len = Math.sqrt(a1.x * a1.x + a1.y * a1.y + a1.z * a1.z);
      assertClose(len, 1, 1e-12, 'длина оси');
      // угол с нормалью эклиптики (+Y) равен наклону оси: y = cos(23.44°) ≈ 0.917
      assertClose(Math.acos(a1.y) / Math.PI * 180, 23.44, 0.01, 'наклон к нормали эклиптики');
      assert(a1.y > 0.9, 'ось почти лежит в плоскости орбиты (y=' + a1.y + ')');
      assert(a1.y > 0, 'северный полюс ниже плоскости эклиптики');
    });

    test('ось наклонена К Солнцу в июне и ОТ Солнца в декабре (проекция sin 23.44°)', function () {
      var jun = dotUnit(Orbital.earthAxisDirection(), sunDirectionFromEarth(new Date(Date.UTC(2026, 5, 21))));
      var dec = dotUnit(Orbital.earthAxisDirection(), sunDirectionFromEarth(new Date(Date.UTC(2026, 11, 21))));
      var sinTilt = Math.sin(Orbital.AXIAL_TILT_DEG * Math.PI / 180);
      assertClose(jun, sinTilt, 0.02, 'dot(июнь)=' + jun + ', ожидалось ≈ sin(наклона)=' + sinTilt);
      assertClose(dec, -sinTilt, 0.02, 'dot(декабрь)=' + dec);
    });

    test('в равноденствие ось перпендикулярна направлению на Солнце', function () {
      var mar = dotUnit(Orbital.earthAxisDirection(), sunDirectionFromEarth(new Date(Date.UTC(2026, 2, 20))));
      assert(Math.abs(mar) < 0.1, 'dot(март)=' + mar);
    });

    test('сезоны по датам (северное полушарие)', function () {
      assert(Orbital.seasonForDate(new Date(Date.UTC(2026, 0, 15))) === 'зима', '15 января не зима');
      assert(Orbital.seasonForDate(new Date(Date.UTC(2026, 3, 15))) === 'весна', '15 апреля не весна');
      assert(Orbital.seasonForDate(new Date(Date.UTC(2026, 6, 15))) === 'лето', '15 июля не лето');
      assert(Orbital.seasonForDate(new Date(Date.UTC(2026, 9, 15))) === 'осень', '15 октября не осень');
    });

    test('маркеры: 4 штуки с типовыми датами равноденствий/солнцестояний', function () {
      var ms = Orbital.seasonMarkers(2026);
      assert(ms.length === 4, 'маркеров ' + ms.length);
      var expected = [[2, 20], [5, 21], [8, 23], [11, 21]];
      for (var i = 0; i < 4; i++) {
        assert(ms[i].date.getUTCFullYear() === 2026, 'год маркера ' + i);
        assert(Math.abs(ms[i].date.getUTCMonth() - expected[i][0]) === 0, 'месяц маркера ' + i + ': ' + ms[i].date.toISOString());
        assert(Math.abs(ms[i].date.getUTCDate() - expected[i][1]) <= 2, 'день маркера ' + i + ': ' + ms[i].date.toISOString());
        assert(typeof ms[i].name === 'string' && ms[i].name.length > 0, 'нет имени у маркера ' + i);
      }
    });

    test('позиции Земли в парных маркерах противоположны', function () {
      var ms = Orbital.seasonMarkers(2026);
      var dotMar = dotUnit(Orbital.earthPositionAU(ms[0].date), Orbital.earthPositionAU(ms[2].date));
      var dotJun = dotUnit(Orbital.earthPositionAU(ms[1].date), Orbital.earthPositionAU(ms[3].date));
      assert(dotMar < -0.999, 'март/сентябрь не противоположны: ' + dotMar);
      assert(dotJun < -0.999, 'июнь/декабрь не противоположны: ' + dotJun);
    });
  }

  function keplerSuite(test, Kepler, Orbital) {
    // Элементы JPL/Standish «Keplerian Elements for Approximate Positions»
    // (эпоха J2000.0, скорости — на юлианское столетие; рама равноденствия J2000)
    var MERCURY = {
      a: 0.38709927, aDot: 0.00000037,
      e: 0.20563593, eDot: 0.00001906,
      i: 7.00497902, iDot: -0.00594749,
      L: 252.25032350, LDot: 149472.67411175,
      peri: 77.45779628, periDot: 0.16047689,
      node: 48.33076593, nodeDot: -0.12534081
    };
    var MARS = {
      a: 1.52371034, aDot: 0.00001847,
      e: 0.09339410, eDot: 0.00007882,
      i: 1.84969142, iDot: -0.00813131,
      L: -4.55343205, LDot: 19140.30268499,
      peri: -23.94362959, periDot: 0.44441088,
      node: 49.55953891, nodeDot: -0.29257343
    };
    var EARTH = {
      a: 1.00000261, aDot: 0.00000562,
      e: 0.01671123, eDot: -0.00004392,
      i: -0.00001531, iDot: -0.01294668,
      L: 100.46457166, LDot: 35999.37244981,
      peri: 102.93768193, periDot: 0.32327364,
      node: 0.0, nodeDot: 0.0
    };
    // синтетическая орбита с заметным наклоном (наклон должен быть виден)
    var TILTED = {
      a: 2.2, aDot: 0, e: 0.15, eDot: 0, i: 10, iDot: 0,
      L: 30, LDot: 11033, peri: 100, periDot: 0, node: 20, nodeDot: 0
    };
    var DAY_MS = 86400000;
    var START = Date.UTC(2026, 0, 1);

    function periodDays(els) { return 365.25 * Math.pow(els.a, 1.5); }
    function dist(p) { return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z); }

    test('позиция из элементов: r весь период в пределах апсид [a(1−e), a(1+e)]', function () {
      [MERCURY, TILTED].forEach(function (els) {
        var rPeri = els.a * (1 - els.e), rApe = els.a * (1 + els.e);
        var P = periodDays(els);
        for (var t = START; t < START + P * DAY_MS; t += P * DAY_MS / 200) {
          var r = dist(Kepler.positionAU(els, new Date(t)));
          assert(r > rPeri - 0.001 && r < rApe + 0.001,
            'r=' + r + ' вне [' + rPeri + ', ' + rApe + '] при a=' + els.a);
        }
      });
    });

    test('орбита лежит в плоскости, наклонённой на i: |широта| ≤ i и достигает i', function () {
      var P = periodDays(TILTED), maxLat = 0;
      for (var t = START; t < START + P * DAY_MS; t += P * DAY_MS / 720) {
        var p = Kepler.positionAU(TILTED, new Date(t));
        var lat = Math.asin(p.y / dist(p)) / (Math.PI / 180);
        assert(Math.abs(lat) <= TILTED.i + 0.01,
          'эклиптическая широта ' + lat + '° превысила наклон ' + TILTED.i + '°');
        if (Math.abs(lat) > maxLat) maxLat = Math.abs(lat);
      }
      assert(maxLat > TILTED.i * 0.9,
        'максимальная широта ' + maxLat + '° не достигает наклона ' + TILTED.i + '° — плоскость не наклонена');
    });

    test('M = L − ϖ и ω = ϖ − Ω вычисляются из одних и тех же данных', function () {
      var date = new Date(Date.UTC(2026, 5, 15, 12));
      var ang = Kepler.anglesAt(MARS, date);
      assert(ang.M >= 0 && ang.M < 360 && ang.omega >= 0 && ang.omega < 360,
        'углы не нормированы в [0,360): M=' + ang.M + ', ω=' + ang.omega);
      var L = ((ang.L % 360) + 360) % 360;
      var peri = ((ang.peri % 360) + 360) % 360;
      var node = ((ang.node % 360) + 360) % 360;
      var mExpected = ((L - peri) % 360 + 360) % 360;
      assertClose(ang.M, mExpected, 1e-9, 'M не равна L − ϖ');
      assertClose(ang.omega, ((peri - node) % 360 + 360) % 360, 1e-9, 'ω не равна ϖ − Ω');
    });

    test('периодичность: через P = a^1,5 лет тело возвращается в ту же точку', function () {
      [MERCURY, TILTED].forEach(function (els) {
        var t1 = Date.UTC(2026, 2, 20, 12);
        var p1 = Kepler.positionAU(els, new Date(t1));
        var p2 = Kepler.positionAU(els, new Date(t1 + periodDays(els) * DAY_MS));
        var d = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
        assert(d < 0.005, 'возврат через период: смещение ' + d + ' а.е. при a=' + els.a);
      });
    });

    // Допуск 0,01 а.е. — измеренный максимум расхождения двух аппроксимаций:
    // элементы Стэндиша заданы в раме равноденствия J2000, константы orbital.js
    // (Меёс) — на равноденствие даты; прецессия с 2000 года ≈ 0,37° (до ~0,0065 а.е.).
    test('кросс-валидация: Земля универсального движка ≈ earthPositionAU (< 0,01 а.е.)', function () {
      [[0, 14], [2, 20], [5, 21], [8, 23]].forEach(function (md) {
        var date = new Date(Date.UTC(2026, md[0], md[1], 12));
        var p1 = Kepler.positionAU(EARTH, date);
        var p2 = Orbital.earthPositionAU(date);
        var d = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
        assert(d < 0.01, 'расхождение ' + d + ' а.е. на ' + date.toISOString().slice(0, 10));
      });
    });

    // vis-viva Марса: расчёт по сетке средней аномалии даёт 21,97–26,50, среднее 24,08 км/с
    test('vis-viva: скорость Марса в [21,5; 27] км/с, средняя ≈ 24 км/с', function () {
      var P = periodDays(MARS), sum = 0, n = 0, min = Infinity, max = -Infinity;
      for (var t = START; t < START + P * DAY_MS; t += P * DAY_MS / 300) {
        var v = Kepler.speedKms(MARS, new Date(t));
        sum += v; n++;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      assert(min > 21.5 && max < 27, 'скорость вне [21,5; 27]: min=' + min + ', max=' + max);
      var mean = sum / n;
      assert(mean > 23.4 && mean < 24.8, 'средняя скорость ' + mean + ' не ≈ 24 км/с');
    });
  }

  function bodiesSuite(test, Bodies) {
    test('каталог: ровно 8 планет с уникальными id, полными данными, по порядку орбит', function () {
      assert(Bodies.planets.length === 8, 'планет ' + Bodies.planets.length + ', а не 8');
      var seen = {};
      Bodies.planets.forEach(function (p) {
        assert(!(p.id in seen), 'дубликат id планеты: ' + p.id);
        seen[p.id] = true;
        ['id', 'name', 'color', 'radius', 'tiltDeg', 'periodDays', 'rotationHours', 'orbit'].forEach(function (f) {
          assert(p[f] !== undefined, 'у планеты ' + p.id + ' нет поля ' + f);
        });
        ['a', 'e', 'i', 'L', 'LDot', 'peri', 'periDot', 'node', 'nodeDot'].forEach(function (f) {
          assert(typeof p.orbit[f] === 'number' && isFinite(p.orbit[f]),
            'у планеты ' + p.id + ' элемент ' + f + ' не конечное число');
        });
        assert(p.orbit.a > 0.3 && p.orbit.a < 35, 'у ' + p.id + ' сомнительная a=' + p.orbit.a);
        assert(p.orbit.e >= 0 && p.orbit.e < 0.25, 'у ' + p.id + ' сомнительный e=' + p.orbit.e);
        assert(p.tiltDeg >= 0 && p.tiltDeg <= 180, 'у ' + p.id + ' наклон оси ' + p.tiltDeg + ' вне [0;180]');
        assert(Math.abs(p.rotationHours) > 1 && Math.abs(p.rotationHours) < 10000,
          'у ' + p.id + ' сомнительный период вращения ' + p.rotationHours + ' ч');
        assert(/^#[0-9a-f]{6}$/i.test(p.color), 'у ' + p.id + ' цвет не #rrggbb: ' + p.color);
        assert(p.radius > 0, 'у ' + p.id + ' радиус не положителен');
      });
      for (var k = 1; k < Bodies.planets.length; k++) {
        assert(Bodies.planets[k].orbit.a > Bodies.planets[k - 1].orbit.a,
          'порядок орбит нарушен между ' + Bodies.planets[k - 1].id + ' и ' + Bodies.planets[k].id);
      }
    });

    test('III закон Кеплера: периоды планет согласованы с a^1,5 (допуск 0,5%); якоря Меркурий/Нептун', function () {
      Bodies.planets.forEach(function (p) {
        var fromA = 365.25 * Math.pow(p.orbit.a, 1.5);
        assertClose(p.periodDays, fromA, fromA * 0.005, 'период ' + p.id + ' против a^1,5');
      });
      assertClose(Bodies.planetById('mercury').periodDays, 87.969, 0.05, 'Меркурий');
      assertClose(Bodies.planetById('neptune').periodDays, 60189, 5, 'Нептун');
    });

    test('каталог: ровно 9 спутников, у каждого существующий родитель и полные данные', function () {
      assert(Bodies.moons.length === 9, 'спутников ' + Bodies.moons.length + ', а не 9');
      var expected = ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'charon'].sort();
      var actual = Bodies.moons.map(function (m) { return m.id; }).sort();
      assert(JSON.stringify(actual) === JSON.stringify(expected),
        'набор спутников: ' + actual.join(', '));
      Bodies.moons.forEach(function (m) {
        assert(Bodies.bodyById(m.parent), 'у ' + m.id + ' неизвестный родитель ' + m.parent);
        ['id', 'name', 'parent', 'color', 'radius', 'displayOrbit', 'periodDays', 'orbit'].forEach(function (f) {
          assert(m[f] !== undefined, 'у спутника ' + m.id + ' нет поля ' + f);
        });
        assert(m.orbit.a > 0 && m.orbit.a < 0.05, 'у ' + m.id + ' сомнительная a=' + m.orbit.a + ' а.е.');
        assert(m.orbit.e >= 0 && m.orbit.e < 0.1, 'у ' + m.id + ' сомнительный e=' + m.orbit.e);
        assert(m.displayOrbit > Bodies.bodyById(m.parent).radius,
          'у ' + m.id + ' орбита (' + m.displayOrbit + ') внутри родителя');
      });
    });

    test('лапласов резонанс галилеевых: отношения периодов ≈ 1 : 2,007 : 4,044', function () {
      var P = {};
      Bodies.moons.forEach(function (m) { P[m.id] = m.periodDays; });
      assertClose(P.europa / P.io, 2.007, 0.01, 'Европа/Ио');
      assertClose(P.ganymede / P.io, 4.044, 0.01, 'Ганимед/Ио');
    });

    test('якорные данные спутников (NASA/JPL): Луна, Ио, Титан, Фобос', function () {
      var byId = {};
      Bodies.moons.forEach(function (m) { byId[m.id] = m; });
      assertClose(byId.moon.periodDays, 27.3217, 0.01, 'период Луны');
      assertClose(byId.moon.orbit.a, 384400 / 149597870.7, 1e-5, 'a Луны (384 400 км в а.е.)');
      assertClose(byId.io.periodDays, 1.769, 0.002, 'период Ио');
      assertClose(byId.titan.periodDays, 15.945, 0.005, 'период Титана');
      assertClose(byId.phobos.periodDays, 0.3189, 0.002, 'период Фобоса');
      assertClose(byId.deimos.periodDays, 1.2624, 0.002, 'период Деймоса');
      assertClose(byId.callisto.periodDays, 16.689, 0.005, 'период Каллисто');
    });

    test('пояс астероидов: между Марсом и Юпитером, разумное число частиц', function () {
      var belt = Bodies.belt;
      assert(belt.count >= 1000 && belt.count <= 5000, 'частиц в поясе: ' + belt.count);
      assert(belt.aMin > Bodies.planetById('mars').orbit.a, 'внутренний край пояса не за Марсом');
      assert(belt.aMax < Bodies.planetById('jupiter').orbit.a, 'внешний край пояса не до Юпитера');
      assert(belt.aMax > belt.aMin, 'края пояса перепутаны');
    });
  }

  function scalesSuite(test, Scales) {
    test('радиальная функция √r монотонна: дальше — значит больше экранная орбита', function () {
      var prev = Scales.orbitRadius(0.3);
      for (var a = 0.4; a <= 31.0001; a += 0.1) {
        var r = Scales.orbitRadius(a);
        assert(r > prev, 'orbitRadius не возрастает при a=' + a.toFixed(1) + ': ' + r + ' ≤ ' + prev);
        prev = r;
      }
    });

    test('Земля якорится на 20 мировых единиц (преемственность нынешней сцены)', function () {
      assertClose(Scales.orbitRadius(1), 20, 1e-9, 'орбита Земли');
    });

    test('соседние орбиты планет различимы: зазор ≥ 2,5 единицы (фактический минимум — Венера—Земля)', function () {
      var A = [0.38709927, 0.72333566, 1.00000261, 1.52371034, 5.20288700, 9.53667594, 19.18916464, 30.06992276];
      var prev = Scales.orbitRadius(A[0]);
      for (var k = 1; k < A.length; k++) {
        var r = Scales.orbitRadius(A[k]);
        assert(r - prev >= 2.5, 'зазор орбит ' + (k - 1) + '—' + k + ' = ' + (r - prev) + ' < 2,5');
        prev = r;
      }
    });

    test('якоря масштаба: Меркурий ≈ 12,44, Нептун ≈ 109,67 единиц', function () {
      assertClose(Scales.orbitRadius(0.38709927), 12.44, 0.02, 'Меркурий');
      assertClose(Scales.orbitRadius(30.06992276), 109.67, 0.05, 'Нептун');
    });

    test('пояс астероидов: [2,1; 3,3] а.е. ложится между орбитами Марса и Юпитера', function () {
      var inner = Scales.orbitRadius(2.1), outer = Scales.orbitRadius(3.3);
      var mars = Scales.orbitRadius(1.52371034), jupiter = Scales.orbitRadius(5.20288700);
      assert(inner > mars && outer < jupiter,
        'пояс [' + inner + '; ' + outer + '] не между Марсом (' + mars + ') и Юпитером (' + jupiter + ')');
      assertClose(inner, 28.98, 0.05, 'внутренний край');
      assertClose(outer, 36.33, 0.05, 'внешний край');
    });

    test('орбиты лун: линейное сжатие displayOrbit·(r/a) сохраняет пропорции и эксцентриситет', function () {
      var displayOrbit = 3.4, a = 0.0025696, e = 0.0549;
      assertClose(Scales.moonOrbitRadius(displayOrbit, a, a), displayOrbit, 1e-9, 'при r=a');
      assertClose(Scales.moonOrbitRadius(displayOrbit, a, a * (1 - e)), displayOrbit * (1 - e), 1e-9, 'в перигее');
      assertClose(Scales.moonOrbitRadius(displayOrbit, a, a * 1.5), displayOrbit * 1.5, 1e-9, 'линейность');
    });
  }

  function dwarfsSuite(test, Bodies) {
    test('каталог: ровно 1 карликовая планета с полным набором полей', function () {
      assert(Bodies.dwarfs && Bodies.dwarfs.length === 1,
        'карликовых ' + (Bodies.dwarfs || []).length + ', а не 1');
      var p = Bodies.dwarfs[0];
      assert(p.id === 'pluto', 'id карликовой: ' + p.id);
      assert(p.name === 'Плутон', 'имя карликовой: ' + p.name);
      ['id', 'name', 'color', 'radius', 'tiltDeg', 'periodDays', 'rotationHours', 'orbit'].forEach(function (f) {
        assert(p[f] !== undefined, 'у Плутона нет поля ' + f);
      });
      ['a', 'e', 'i', 'L', 'LDot', 'peri', 'periDot', 'node', 'nodeDot'].forEach(function (f) {
        assert(typeof p.orbit[f] === 'number' && isFinite(p.orbit[f]),
          'у Плутона элемент ' + f + ' не конечное число');
      });
      assert(/^#[0-9a-f]{6}$/i.test(p.color), 'цвет Плутона не #rrggbb: ' + p.color);
    });

    test('Плутон: якоря элементов Standish и физические характеристики', function () {
      var p = Bodies.dwarfById('pluto');
      assert(p, 'dwarfById не находит pluto');
      assertClose(p.orbit.a, 39.48211675, 1e-6, 'a');
      assertClose(p.orbit.e, 0.24882730, 1e-6, 'e');
      assertClose(p.orbit.i, 17.14001206, 1e-6, 'i');
      assertClose(p.orbit.LDot, 145.20780515, 1e-5, 'LDot');
      assertClose(p.tiltDeg, 122.53, 0.01, 'наклон оси');
      assertClose(p.rotationHours, -153.3, 0.01, 'период вращения (ретроградное)');
      assertClose(p.periodDays, 90560, 10, 'период');
    });

    test('Плутон: перигелий внутри орбиты Нептуна (29,66 < 30,07 а.е.)', function () {
      var pluto = Bodies.dwarfById('pluto');
      var neptune = Bodies.planetById('neptune');
      var peri = pluto.orbit.a * (1 - pluto.orbit.e);
      assert(peri > 29 && peri < 30, 'перигелий ' + peri + ' вне [29; 30] а.е.');
      assert(peri < neptune.orbit.a,
        'перигелий ' + peri + ' не внутри орбиты Нептуна (' + neptune.orbit.a + ')');
    });

    test('III закон Кеплера распространяется на карликовые', function () {
      Bodies.dwarfs.forEach(function (p) {
        var fromA = 365.25 * Math.pow(p.orbit.a, 1.5);
        assertClose(p.periodDays, fromA, fromA * 0.005, 'период Плутона против a^1,5');
      });
    });

    test('Харон: спутник Плутона с корректными данными', function () {
      var charon = Bodies.moonById('charon');
      assert(charon, 'Харон не найден в каталоге');
      assert(charon.parent === 'pluto', 'родитель Харона: ' + charon.parent);
      assert(charon.referencePlane === 'equator', 'Харон должен лежать в плоскости экватора Плутона');
      assertClose(charon.periodDays, 6.3872, 0.001, 'период Харона');
      assertClose(charon.orbit.a, 19591 / 149597870.7, 1e-6, 'a Харона (19 591 км в а.е.)');
      assert(charon.orbit.e >= 0 && charon.orbit.e < 0.01, 'e Харона ' + charon.orbit.e);
      assert(charon.displayOrbit > Bodies.bodyById('pluto').radius,
        'орбита Харона внутри Плутона');
    });

    test('bodyById: находит планеты и карликовые; planetById не знает Плутона', function () {
      assert(Bodies.bodyById('earth') === Bodies.planetById('earth'), 'bodyById теряет планеты');
      assert(Bodies.bodyById('pluto'), 'bodyById не находит Плутона');
      assert(!Bodies.planetById('pluto'), 'Плутон попал в планеты');
      assert(!Bodies.bodyById('nonexistent'), 'bodyById выдумывает тела');
    });
  }

  function uiSuite(test, AppUI) {
    test('формат даты: ДД.ММ.ГГГГ, ЧЧ:ММ', function () {
      var d = new Date(2026, 2, 20, 14, 46);
      assert(AppUI.formatDateRu(d) === '20.03.2026, 14:46',
        'получено: ' + AppUI.formatDateRu(d));
      var d2 = new Date(2026, 11, 31, 23, 59);
      assert(AppUI.formatDateRu(d2) === '31.12.2026, 23:59',
        'получено: ' + AppUI.formatDateRu(d2));
    });

    test('формат скорости: человеческие единицы', function () {
      assert(AppUI.formatSpeed(60) === '1 мин/с', AppUI.formatSpeed(60));
      assert(AppUI.formatSpeed(90) === '1,5 мин/с', AppUI.formatSpeed(90));
      assert(AppUI.formatSpeed(1800) === '30 мин/с', AppUI.formatSpeed(1800));
      assert(AppUI.formatSpeed(3600) === '1 ч/с', AppUI.formatSpeed(3600));
      assert(AppUI.formatSpeed(7200) === '2 ч/с', AppUI.formatSpeed(7200));
      assert(AppUI.formatSpeed(86400) === '1 дн/с', AppUI.formatSpeed(86400));
      assert(AppUI.formatSpeed(2592000) === '1 мес/с', AppUI.formatSpeed(2592000));
      assert(AppUI.formatSpeed(2700000) === '1 мес/с', AppUI.formatSpeed(2700000));
    });

    test('формат скорости: год в секунду и плюрализация год/года/лет', function () {
      assert(AppUI.formatSpeed(31557600) === '1 год/с', AppUI.formatSpeed(31557600));
      assert(AppUI.formatSpeed(47336400) === '1,5 года/с', AppUI.formatSpeed(47336400));
      assert(AppUI.formatSpeed(157788000) === '5 лет/с', AppUI.formatSpeed(157788000));
    });

    test('контракт скорости: максимум слайдера = 1 год/с (31557600)', function () {
      assertClose(AppUI.SPEED_MAX, 31557600, 0.5, 'SPEED_MAX');
      assertClose(AppUI.sliderToSpeed(1000), 31557600, 1, 'край слайдера');
      assertClose(AppUI.sliderToSpeed(0), 60, 0.001, 'мин');
      var mid = AppUI.sliderToSpeed(500);
      assertClose(mid, Math.sqrt(60 * 31557600), 1, 'середина (геометрическое среднее)');
    });

    test('формат периода: меньше года — в днях, больше — в годах', function () {
      assert(AppUI.formatPeriod(87.969) === '88 дн', AppUI.formatPeriod(87.969));
      assert(AppUI.formatPeriod(224.701) === '224,7 дн', AppUI.formatPeriod(224.701));
      assert(AppUI.formatPeriod(27.3217) === '27,3 дн', AppUI.formatPeriod(27.3217));
      assert(AppUI.formatPeriod(0.3189) === '0,3 дн', AppUI.formatPeriod(0.3189));
      assert(AppUI.formatPeriod(365.256) === '1 год', AppUI.formatPeriod(365.256));
      assert(AppUI.formatPeriod(686.980) === '1,9 года', AppUI.formatPeriod(686.980));
      assert(AppUI.formatPeriod(4332.589) === '11,9 года', AppUI.formatPeriod(4332.589));
      assert(AppUI.formatPeriod(10759.22) === '29,5 года', AppUI.formatPeriod(10759.22));
      assert(AppUI.formatPeriod(30685.4) === '84 года', AppUI.formatPeriod(30685.4));
      assert(AppUI.formatPeriod(60189) === '164,8 года', AppUI.formatPeriod(60189));
    });

    test('плюрализация лет: таблица веток год/года/лет', function () {
      assert(AppUI.formatPeriod(365.25 * 2) === '2 года', AppUI.formatPeriod(730.5));
      assert(AppUI.formatPeriod(365.25 * 4) === '4 года', AppUI.formatPeriod(1461));
      assert(AppUI.formatPeriod(365.25 * 5) === '5 лет', AppUI.formatPeriod(1826.25));
      assert(AppUI.formatPeriod(365.25 * 12) === '12 лет', AppUI.formatPeriod(4383));
      assert(AppUI.formatPeriod(365.25 * 21) === '21 год', AppUI.formatPeriod(7670.25));
      assert(AppUI.formatPeriod(365.25 * 111) === '111 лет', AppUI.formatPeriod(40542.75));
      assert(AppUI.formatPeriod(365.25 * 165) === '165 лет', AppUI.formatPeriod(60266.25));
    });

    test('planetStateText: Марс — имя, расстояние, скорость, период (без DOM)', function () {
      var text = AppUI.planetStateText('mars', new Date(Date.UTC(2026, 2, 20, 12)));
      assert(text.indexOf('Марс') === 0, 'строка не начинается с имени: ' + text);
      assert(/а\.е\./.test(text) && /млн км/.test(text), 'нет расстояния: ' + text);
      assert(/км\/с/.test(text), 'нет скорости: ' + text);
      assert(/период 1,9 года/.test(text), 'нет периода Марса: ' + text);
    });

    test('planetStateText: Юпитер — период в годах, разумная скорость', function () {
      var text = AppUI.planetStateText('jupiter', new Date(Date.UTC(2026, 2, 20, 12)));
      assert(/период 11,9 года/.test(text), 'нет периода Юпитера: ' + text);
      var vMatch = text.match(/([\d,]+) км\/с/);
      assert(vMatch, 'нет скорости: ' + text);
      var v = parseFloat(vMatch[1].replace(',', '.'));
      assert(v > 12 && v < 14.2, 'скорость Юпитера ' + v + ' вне [12; 14,2] км/с');
    });

    test('planetStateText: Земля из универсального движка — период «1 год»', function () {
      var text = AppUI.planetStateText('earth', new Date(Date.UTC(2026, 2, 20, 12)));
      assert(text.indexOf('Земля') === 0, 'нет имени: ' + text);
      assert(/период 1 год$/.test(text), 'нет периода Земли: ' + text);
    });

    test('planetStateText: Плутон — имя, расстояние, скорость 3–7 км/с, период 247,9 года', function () {
      var text = AppUI.planetStateText('pluto', new Date(Date.UTC(2026, 2, 20, 12)));
      assert(text.indexOf('Плутон') === 0, 'строка не начинается с имени: ' + text);
      assert(/а\.е\./.test(text) && /млн км/.test(text), 'нет расстояния: ' + text);
      var vMatch = text.match(/([\d,]+) км\/с/);
      assert(vMatch, 'нет скорости: ' + text);
      var v = parseFloat(vMatch[1].replace(',', '.'));
      assert(v > 3 && v < 7, 'скорость Плутона ' + v + ' вне [3; 7] км/с');
      assert(/период 247,9 года$/.test(text), 'нет периода Плутона: ' + text);
    });

    test('слайдер: обратное преобразование — roundtrip', function () {
      for (var v = 0; v <= 1000; v += 137) {
        var s = AppUI.sliderToSpeed(v);
        assertClose(AppUI.speedToSlider(s), v, 0.001, 'roundtrip для v=' + v);
      }
    });

    test('формат расстояния Солнце-Земля: «X,XXX а.е. · YYY,Y млн км»', function () {
      assert(AppUI.formatSunDistance(1.000001018) === '1,000 а.е. · 149,6 млн км',
        'получено: ' + AppUI.formatSunDistance(1.000001018));
      assert(AppUI.formatSunDistance(0.98329) === '0,983 а.е. · 147,1 млн км',
        'получено: ' + AppUI.formatSunDistance(0.98329));
      assert(AppUI.formatSunDistance(1.01672) === '1,017 а.е. · 152,1 млн км',
        'получено: ' + AppUI.formatSunDistance(1.01672));
    });

    test('формат орбитальной скорости Земли: «XX,X км/с»', function () {
      assert(AppUI.formatEarthSpeed(29.7847) === '29,8 км/с',
        'получено: ' + AppUI.formatEarthSpeed(29.7847));
      assert(AppUI.formatEarthSpeed(30.2867) === '30,3 км/с',
        'получено: ' + AppUI.formatEarthSpeed(30.2867));
    });
  }

  function runSuite(modules, log) {
    log = log || function (l) { console.log(l); };
    var passed = 0, failed = 0;
    function test(name, fn) {
      try { fn(); passed++; log('PASS ' + name); }
      catch (e) { failed++; log('FAIL ' + name + ' :: ' + (e && e.message ? e.message : e)); }
    }

    if (!modules.TimeModel) {
      failed += 1;
      log('FAIL timeModel :: модуль не загружен (js/timeModel.js отсутствует?)');
    } else {
      timeModelSuite(test, modules.TimeModel);
    }

    if (!modules.Orbital) {
      failed += 1;
      log('FAIL orbital :: модуль не загружен (js/orbital.js отсутствует?)');
    } else {
      orbitalSuite(test, modules.Orbital);
      seasonSuite(test, modules.Orbital);
      apsisSuite(test, modules.Orbital);
    }

    if (!modules.Kepler) {
      failed += 1;
      log('FAIL kepler :: модуль не загружен (js/kepler.js отсутствует?)');
    } else {
      keplerSuite(test, modules.Kepler, modules.Orbital);
    }

    if (!modules.Bodies) {
      failed += 1;
      log('FAIL bodies :: модуль не загружен (js/bodies.js отсутствует?)');
    } else {
      bodiesSuite(test, modules.Bodies);
      dwarfsSuite(test, modules.Bodies);
    }

    if (!modules.Scales) {
      failed += 1;
      log('FAIL scales :: модуль не загружен (js/scales.js отсутствует?)');
    } else {
      scalesSuite(test, modules.Scales);
    }

    if (!modules.AppUI) {
      failed += 1;
      log('FAIL ui :: модуль не загружен (js/ui.js отсутствует?)');
    } else {
      uiSuite(test, modules.AppUI);
    }

    var verdict = failed === 0
      ? 'RESULT: PASS (' + passed + ' тестов)'
      : 'RESULT: FAIL (упало ' + failed + ' из ' + (passed + failed) + ')';
    log(verdict);
    return { passed: passed, failed: failed, verdict: verdict };
  }

  return { runSuite: runSuite };
});
