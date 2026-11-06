(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bodies = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Каталог тел Солнечной системы для наглядной симуляции.
  //
  // Планеты — элементы JPL «Keplerian Elements for Approximate Positions of the
  // Major Planets» (E. M. Standish), эпоха J2000.0, скорости на юлианское столетие,
  // рама равноденствия J2000. Периоды и наклоны осей — NASA Planetary Fact Sheets.
  //
  // Спутники — a/e/i/P по JPL SSD «Satellite Mean Orbital Elements» (эпоха J2000;
  // у Луны наклон и элементы — к эклиптике, у остальных — к экватору родителя).
  // Фазы (L, peri, node) спутников даны приблизительно — для наглядной симуляции
  // точность фаз не критична; периоды и большие полуоси точные.
  //
  // radius/displayOrbit — ОТОбражаемые размеры в мировых единицах сцены,
  // НЕ в масштабе (см. README). Единицы элементов движка: a — а.е., углы — градусы.
  var AU_KM = 149597870.7;

  var planets = [
    {
      id: 'mercury', name: 'Меркурий', color: '#b1adad',
      radius: 0.5, tiltDeg: 0.03, rotationHours: 1407.6, periodDays: 87.969,
      orbit: { a: 0.38709927, aDot: 0.00000037, e: 0.20563593, eDot: 0.00001906,
        i: 7.00497902, iDot: -0.00594749, L: 252.25032350, LDot: 149472.67411175,
        peri: 77.45779628, periDot: 0.16047689, node: 48.33076593, nodeDot: -0.12534081 }
    },
    {
      id: 'venus', name: 'Венера', color: '#decdb4',
      radius: 0.85, tiltDeg: 177.4, rotationHours: -5832.5, periodDays: 224.701,
      orbit: { a: 0.72333566, aDot: 0.00000390, e: 0.00677672, eDot: -0.00004107,
        i: 3.39467605, iDot: -0.00078890, L: 181.97909950, LDot: 58517.81538729,
        peri: 131.60246718, periDot: 0.00268329, node: 76.67984255, nodeDot: -0.27769418 }
    },
    {
      id: 'earth', name: 'Земля', color: '#4f9de8',
      radius: 1.4, tiltDeg: 23.44, rotationHours: 23.934, periodDays: 365.256,
      orbit: { a: 1.00000261, aDot: 0.00000562, e: 0.01671123, eDot: -0.00004392,
        i: -0.00001531, iDot: -0.01294668, L: 100.46457166, LDot: 35999.37244981,
        peri: 102.93768193, periDot: 0.32327364, node: 0.0, nodeDot: 0.0 }
    },
    {
      id: 'mars', name: 'Марс', color: '#c1440e',
      radius: 0.75, tiltDeg: 25.19, rotationHours: 24.623, periodDays: 686.980,
      orbit: { a: 1.52371034, aDot: 0.00001847, e: 0.09339410, eDot: 0.00007882,
        i: 1.84969142, iDot: -0.00813131, L: -4.55343205, LDot: 19140.30268499,
        peri: -23.94362959, periDot: 0.44441088, node: 49.55953891, nodeDot: -0.29257343 }
    },
    {
      id: 'jupiter', name: 'Юпитер', color: '#d8cbb2',
      radius: 2.3, tiltDeg: 3.13, rotationHours: 9.925, periodDays: 4332.589,
      orbit: { a: 5.20288700, aDot: -0.00011607, e: 0.04838624, eDot: -0.00013253,
        i: 1.30439695, iDot: -0.00183714, L: 34.39644051, LDot: 3034.74612775,
        peri: 14.72847983, periDot: 0.21252668, node: 100.47390909, nodeDot: 0.20469106 }
    },
    {
      id: 'saturn', name: 'Сатурн', color: '#e3d9b8',
      radius: 2.0, tiltDeg: 26.73, rotationHours: 10.656, periodDays: 10759.22,
      orbit: { a: 9.53667594, aDot: -0.00125060, e: 0.05386179, eDot: -0.00050991,
        i: 2.48599187, iDot: 0.00193609, L: 49.95424423, LDot: 1222.49362201,
        peri: 92.59887831, periDot: -0.41897216, node: 113.66242448, nodeDot: -0.28867794 }
    },
    {
      id: 'uranus', name: 'Уран', color: '#9fd6e8',
      radius: 1.3, tiltDeg: 97.77, rotationHours: -17.24, periodDays: 30685.4,
      orbit: { a: 19.18916464, aDot: -0.00196176, e: 0.04725744, eDot: -0.00004397,
        i: 0.77263783, iDot: -0.00242939, L: 313.23810451, LDot: 428.48202785,
        peri: 170.95427630, periDot: 0.40805281, node: 74.01692503, nodeDot: 0.04240589 }
    },
    {
      id: 'neptune', name: 'Нептун', color: '#7288d8',
      radius: 1.25, tiltDeg: 28.32, rotationHours: 16.11, periodDays: 60189,
      orbit: { a: 30.06992276, aDot: 0.00026291, e: 0.00859048, eDot: 0.00005105,
        i: 1.77004347, iDot: 0.00035372, L: -55.12002969, LDot: 218.45945325,
        peri: 44.96476227, periDot: -0.32241464, node: 131.78422574, nodeDot: -0.00508664 }
    }
  ];

  function kmToAU(km) { return km / AU_KM; }
  // средняя скорость долготы, °/столетие, из периода в сутках
  function lDot(periodDays) { return 360 / periodDays * 36525; }

  var moons = [
    {
      id: 'moon', name: 'Луна', parent: 'earth', color: '#d9d9d9',
      radius: 0.38, displayOrbit: 3.4, periodDays: 27.3217,
      // наклон и элементы — к эклиптике; скорости узла и перигелия — стандартные
      // (регрессия узлов 18,6 года, прецессия линии апсид 8,85 года)
      referencePlane: 'ecliptic',
      orbit: { a: kmToAU(384400), e: 0.0549, i: 5.145,
        L: 218.316, LDot: lDot(27.3217), peri: 83.353, periDot: 4069, node: 125.045, nodeDot: -1934.1 }
    },
    {
      id: 'phobos', name: 'Фобос', parent: 'mars', color: '#9c7a5b',
      radius: 0.12, displayOrbit: 1.6, periodDays: 0.3189,
      referencePlane: 'equator',
      orbit: { a: kmToAU(9376), e: 0.0151, i: 1.08,
        L: 150, LDot: lDot(0.3189), peri: 150, periDot: 0, node: 200, nodeDot: 0 }
    },
    {
      id: 'deimos', name: 'Деймос', parent: 'mars', color: '#b09a82',
      radius: 0.1, displayOrbit: 2.4, periodDays: 1.2624,
      referencePlane: 'equator',
      orbit: { a: kmToAU(23463), e: 0.00033, i: 1.79,
        L: 45, LDot: lDot(1.2624), peri: 100, periDot: 0, node: 310, nodeDot: 0 }
    },
    {
      id: 'io', name: 'Ио', parent: 'jupiter', color: '#e8d157',
      radius: 0.32, displayOrbit: 3.6, periodDays: 1.7691,
      referencePlane: 'equator',
      orbit: { a: kmToAU(421800), e: 0.0041, i: 0.04,
        L: 342, LDot: lDot(1.7691), peri: 85, periDot: 0, node: 100, nodeDot: 0 }
    },
    {
      id: 'europa', name: 'Европа', parent: 'jupiter', color: '#d8cbb0',
      radius: 0.28, displayOrbit: 4.6, periodDays: 3.5512,
      referencePlane: 'equator',
      orbit: { a: kmToAU(671100), e: 0.0094, i: 0.47,
        L: 171, LDot: lDot(3.5512), peri: 88, periDot: 0, node: 100, nodeDot: 0 }
    },
    {
      id: 'ganymede', name: 'Ганимед', parent: 'jupiter', color: '#b8a98c',
      radius: 0.42, displayOrbit: 5.8, periodDays: 7.1546,
      referencePlane: 'equator',
      orbit: { a: kmToAU(1070400), e: 0.0011, i: 0.20,
        L: 317, LDot: lDot(7.1546), peri: 90, periDot: 0, node: 100, nodeDot: 0 }
    },
    {
      id: 'callisto', name: 'Каллисто', parent: 'jupiter', color: '#8d8578',
      radius: 0.39, displayOrbit: 7.4, periodDays: 16.689,
      referencePlane: 'equator',
      orbit: { a: kmToAU(1882700), e: 0.0074, i: 0.19,
        L: 64, LDot: lDot(16.689), peri: 52, periDot: 0, node: 100, nodeDot: 0 }
    },
    {
      id: 'titan', name: 'Титан', parent: 'saturn', color: '#d9a94f',
      radius: 0.4, displayOrbit: 5.4, periodDays: 15.945,
      referencePlane: 'equator',
      orbit: { a: kmToAU(1221870), e: 0.0288, i: 0.35,
        L: 205, LDot: lDot(15.945), peri: 78, periDot: 0, node: 88, nodeDot: 0 }
    },
    {
      // Харон: a/P точные (JPL SSD); фазы приблизительные, как у прочих спутников.
      // Плоскость — экватор Плутона: ось Плутона наклонена на 122,53°, поэтому
      // орбита Харона на сцене «завалена» вместе с родителем — наглядный эффект.
      id: 'charon', name: 'Харон', parent: 'pluto', color: '#9a938c',
      radius: 0.45, displayOrbit: 3.0, periodDays: 6.3872,
      referencePlane: 'equator',
      orbit: { a: kmToAU(19591), e: 0.0002, i: 0.08,
        L: 220, LDot: lDot(6.3872), peri: 0, periDot: 0, node: 0, nodeDot: 0 }
    }
  ];

  // Карликовые планеты. Элементы — та же таблица JPL/Standish (Table 2a, эпоха
  // J2000, скорости на столетие). Плутон: период/наклон оси/ретроградное вращение
  // — NASA Planetary Fact Sheet; эксцентриситет велик, перигелий (29,66 а.е.)
  // лежит внутри орбиты Нептуна (30,07 а.е.) — орбиты пересекаются, это честно.
  var dwarfs = [
    {
      id: 'pluto', name: 'Плутон', color: '#c8a878',
      radius: 0.9, tiltDeg: 122.53, rotationHours: -153.3, periodDays: 90560,
      orbit: { a: 39.48211675, aDot: -0.00031596, e: 0.24882730, eDot: 0.00005170,
        i: 17.14001206, iDot: 0.00004818, L: 238.92903833, LDot: 145.20780515,
        peri: 224.06891629, periDot: -0.04062942, node: 110.30393684, nodeDot: -0.01183482 }
    }
  ];

  // Символический пояс астероидов: главная часть между Марсом и Юпитером
  var belt = { aMin: 2.1, aMax: 3.3, count: 2200 };

  var planetIndex = {};
  planets.forEach(function (p) { planetIndex[p.id] = p; });
  var moonIndex = {};
  moons.forEach(function (m) { moonIndex[m.id] = m; });
  var dwarfIndex = {};
  dwarfs.forEach(function (p) { dwarfIndex[p.id] = p; });

  // все тела, к которым можно прицелиться селектором/камерой
  var bodyIndex = {};
  planets.forEach(function (p) { bodyIndex[p.id] = p; });
  dwarfs.forEach(function (p) { bodyIndex[p.id] = p; });

  function planetById(id) { return planetIndex[id]; }
  function moonById(id) { return moonIndex[id]; }
  function dwarfById(id) { return dwarfIndex[id]; }
  function bodyById(id) { return bodyIndex[id]; }

  return {
    planets: planets,
    moons: moons,
    dwarfs: dwarfs,
    belt: belt,
    planetById: planetById,
    moonById: moonById,
    dwarfById: dwarfById,
    bodyById: bodyById
  };
});
