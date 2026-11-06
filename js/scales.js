(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scales = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Экранные масштабы сцены. Расстояния сжаты нелинейно (√r): все 8 орбит
  // различимы на одном экране, при этом порядок и взаимные пропорции близких
  // орбит сохраняются. Честные числа (а.е., км/с, периоды) — в панели.
  // Радиусы тел — отображаемые, НЕ в масштабе (см. README).
  var EARTH_UNITS = 20; // мировых единиц на орбите Земли (преемственность сцены)

  // Экранный радиус орбиты для большой полуоси a (а.е.): 20·√a
  function orbitRadius(aAU) {
    return EARTH_UNITS * Math.sqrt(aAU);
  }

  // Экранный радиус орбиты спутника: масштабируем заданный displayOrbit
  // пропорционально текущему расстоянию r к истинному a — форма (эллиптичность)
  // орбиты сохраняется.
  function moonOrbitRadius(displayOrbit, aAU, rAU) {
    return displayOrbit * (rAU / aAU);
  }

  return {
    orbitRadius: orbitRadius,
    moonOrbitRadius: moonOrbitRadius,
    EARTH_UNITS: EARTH_UNITS
  };
});
