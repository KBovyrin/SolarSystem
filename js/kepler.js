(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./orbital.js'));
  else root.Kepler = factory(root.Orbital);
})(typeof self !== 'undefined' ? self : this, function (Orbital) {
  // Универсальный кеплеров движок: позиция любого тела по орбитальным элементам.
  // Элементы (на эпоху J2000.0, рама равноденствия J2000):
  //   a — большая полуось, а.е.; e — эксцентриситет;
  //   i — наклон, °; L — средняя долгота, °; peri ϖ — долгота перигелия, °; node Ω — долгота узла, °;
  //   *Dot — линейные скорости, на юлианское столетие (источник: JPL/Standish).
  // Мировая рама проекта (как в orbital.js): x — долгота 0°, z — долгота 90°, y — север эклиптики.
  var DEG = Math.PI / 180;
  var DAYS_PER_CENTURY = 36525;
  var VCIRC_1AU_KMS = 29.7847; // круговая скорость на 1 а.е., км/с

  function mod360(x) {
    var r = x % 360;
    return r < 0 ? r + 360 : r;
  }

  // Оскулирующие элементы на дату (линейные скорости на столетие)
  function elementsAt(els, date) {
    var T = Orbital.daysSinceJ2000(date) / DAYS_PER_CENTURY;
    return {
      a: els.a + (els.aDot || 0) * T,
      e: els.e + (els.eDot || 0) * T,
      i: els.i + (els.iDot || 0) * T,
      L: mod360(els.L + (els.LDot || 0) * T),
      peri: mod360(els.peri + (els.periDot || 0) * T),
      node: mod360(els.node + (els.nodeDot || 0) * T)
    };
  }

  // Производные углы: M = L − ϖ (средняя аномалия), ω = ϖ − Ω (аргумент перигелия)
  function anglesAt(els, date) {
    var el = elementsAt(els, date);
    return {
      a: el.a, e: el.e, i: el.i,
      L: el.L, peri: el.peri, node: el.node,
      M: mod360(el.L - el.peri),
      omega: mod360(el.peri - el.node)
    };
  }

  // Гелиоцентрическая позиция, а.е., мировая рама проекта
  function positionAU(els, date) {
    var ang = anglesAt(els, date);
    var E = Orbital.solveKepler(ang.M * DEG, ang.e);
    var r = ang.a * (1 - ang.e * Math.cos(E));
    var nu = 2 * Math.atan2(
      Math.sqrt(1 + ang.e) * Math.sin(E / 2),
      Math.sqrt(1 - ang.e) * Math.cos(E / 2)
    );
    var u = ang.omega * DEG + nu;          // аргумент широты
    var O = ang.node * DEG, inc = ang.i * DEG;
    var cosO = Math.cos(O), sinO = Math.sin(O);
    var cosU = Math.cos(u), sinU = Math.sin(u);
    var cosI = Math.cos(inc), sinI = Math.sin(inc);
    // эклиптические координаты
    var xEcl = r * (cosO * cosU - sinO * sinU * cosI);
    var yEcl = r * (sinO * cosU + cosO * sinU * cosI);
    var zEcl = r * (sinU * sinI);
    // мировая рама: X = x_ecl, Y = z_ecl (север), Z = y_ecl
    return { x: xEcl, y: zEcl, z: yEcl };
  }

  // Орбитальная скорость (vis-viva): v = v_круг(1 а.е.) · sqrt(2/r − 1/a), км/с
  function speedKms(els, date) {
    var ang = anglesAt(els, date);
    var E = Orbital.solveKepler(ang.M * DEG, ang.e);
    var r = ang.a * (1 - ang.e * Math.cos(E));
    return VCIRC_1AU_KMS * Math.sqrt(2 / r - 1 / ang.a);
  }

  return {
    elementsAt: elementsAt,
    anglesAt: anglesAt,
    positionAU: positionAU,
    speedKms: speedKms
  };
});
