(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(
      require('./orbital.js'),
      require('./kepler.js'),
      require('./bodies.js'),
      require('./scales.js')
    );
  else root.SolarScene = factory(root.Orbital, root.Kepler, root.Bodies, root.Scales);
})(typeof self !== 'undefined' ? self : this, function (Orbital, Kepler, Bodies, Scales) {
  var SUN_RADIUS = 3.2;
  var EARTH_RADIUS = 1.4;
  var SIDEREAL_DAY_MS = 86164090; // сидерические сутки 23ч56м04с
  var STAR_RADIUS = 900;
  var BELT_COLOR = 0x8d8578;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeEarthTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(0, 0, 512, 256);
    // «континенты» — фиксированный набор пятен (детерминированно)
    var blobs = [
      [90, 80, 55, 38], [150, 100, 40, 26], [120, 140, 30, 20],
      [300, 70, 60, 34], [360, 120, 36, 30], [250, 170, 40, 22],
      [430, 150, 44, 40], [60, 190, 50, 18], [200, 60, 26, 16]
    ];
    ctx.fillStyle = '#2e7d32';
    for (var i = 0; i < blobs.length; i++) {
      ctx.beginPath();
      ctx.ellipse(blobs[i][0], blobs[i][1], blobs[i][2], blobs[i][3], 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // полярные шапки
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(0, 0, 512, 16);
    ctx.fillRect(0, 240, 512, 16);
    return canvas;
  }

  function makeStars() {
    var rand = mulberry32(20260320);
    var count = 900;
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var theta = rand() * Math.PI * 2;
      var phi = Math.acos(2 * rand() - 1);
      var r = STAR_RADIUS;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true });
    return new THREE.Points(geometry, material);
  }

  function makeTextSprite(lines, scale, colors) {
    var canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 256);
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = colors[0];
    ctx.fillText(lines[0], 256, 100);
    if (lines[1]) {
      ctx.font = '36px sans-serif';
      ctx.fillStyle = colors[1];
      ctx.fillText(lines[1], 256, 156);
    }
    var texture = new THREE.CanvasTexture(canvas);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(scale[0], scale[1], 1);
    return sprite;
  }

  function create(container) {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 4000);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 700;

    // Солнце: светящаяся сфера + точечный источник света
    var sun = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd54f })
    );
    scene.add(sun);
    var sunLight = new THREE.PointLight(0xfff5e0, Math.PI, 0, 0); // π компенсирует 1/π в BRDF: истинные цвета
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.07)); // ночная сторона чуть различима

    // Экранные позиции на орбитах: направление честное, радиус сжат √r.
    // Земля (r ≈ 1 а.е.) остаётся на 20 мировых единицах, как в прежней сцене.
    function placeOnOrbit(pAU) {
      var r = Math.sqrt(pAU.x * pAU.x + pAU.y * pAU.y + pAU.z * pAU.z);
      var s = r > 0 ? Scales.orbitRadius(r) / r : 0;
      return { x: pAU.x * s, y: pAU.y * s, z: pAU.z * s };
    }

    // ---------- Планеты ----------
    var bodyMap = {};        // id → { group } (верхняя группа: позиция на орбите)
    var saturnTilt = null;

    Bodies.planets.concat(Bodies.dwarfs).forEach(function (p) {
      var group = new THREE.Group();
      var tilt = new THREE.Group();
      tilt.rotation.x = p.tiltDeg * Math.PI / 180;
      group.add(tilt);

      var mesh;
      if (p.id === 'earth') {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(EARTH_RADIUS, 48, 32),
          new THREE.MeshPhongMaterial({
            map: new THREE.CanvasTexture(makeEarthTexture()),
            shininess: 8
          })
        );
      } else {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius, 36, 24),
          new THREE.MeshPhongMaterial({ color: p.color, shininess: 4 })
        );
      }
      tilt.add(mesh);

      if (p.id === 'earth') {
        // Ось вращения: тонкий цилиндр через полюса (не вращается с Землёй) + конус «север»
        var AXIS_HALF = EARTH_RADIUS * 2.2;
        var axisRod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, AXIS_HALF * 2, 10),
          new THREE.MeshBasicMaterial({ color: 0xff9800 })
        );
        tilt.add(axisRod);
        var northCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.4, 12),
          new THREE.MeshBasicMaterial({ color: 0xff9800 })
        );
        northCone.position.y = AXIS_HALF + 0.3;
        tilt.add(northCone);
        var northLabel = makeTextSprite(['С'], [2.2, 1.1], ['#ffb74d']);
        northLabel.position.y = AXIS_HALF + 1.0;
        tilt.add(northLabel);
      }

      if (p.id === 'saturn') {
        // символическое кольцо Сатурна (полупрозрачное, в экваториальной плоскости)
        var ring = new THREE.Mesh(
          new THREE.RingGeometry(p.radius + 0.5, p.radius + 1.7, 64),
          new THREE.MeshBasicMaterial({
            color: 0xb8a98c, side: THREE.DoubleSide, transparent: true, opacity: 0.45
          })
        );
        ring.rotation.x = -Math.PI / 2;
        tilt.add(ring);
        saturnTilt = tilt;
      }

      // подпись планеты
      var label = makeTextSprite([p.name], [7, 3.5], [p.color]);
      label.position.y = p.radius + 2.2;
      group.add(label);

      // линия орбиты: сэмпл модели за период
      var points = [];
      var steps = 180;
      var P = p.periodDays;
      for (var k = 0; k <= steps; k++) {
        var d = new Date(Date.now() + (k / steps) * P * 86400000);
        var wp = p.id === 'earth'
          ? placeOnOrbit(Orbital.earthPositionAU(d))
          : placeOnOrbit(Kepler.positionAU(p.orbit, d));
        points.push(new THREE.Vector3(wp.x, wp.y, wp.z));
      }
      var isEarth = p.id === 'earth';
      var orbitLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: isEarth ? 0xc0a060 : parseInt(p.color.slice(1), 16),
          transparent: true,
          opacity: isEarth ? 0.8 : 0.35
        })
      );
      scene.add(orbitLine);

      scene.add(group);
      bodyMap[p.id] = { group: group, mesh: mesh, tilt: tilt, def: p };
    });

    var earthRec = bodyMap.earth;

    // ---------- Спутники ----------
    var moonRecs = [];
    Bodies.moons.forEach(function (m) {
      var parent = bodyMap[m.parent];
      if (!parent) return;
      // у Луны плоскость — эклиптика (группа планеты), у остальных — экватор родителя (tilt-группа)
      var host = m.referencePlane === 'ecliptic' ? parent.group : parent.tilt;

      var orbitGroup = new THREE.Group();
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(m.radius, 20, 14),
        new THREE.MeshPhongMaterial({ color: m.color, shininess: 4 })
      );
      orbitGroup.add(mesh);

      // линия орбиты — в системе РОДИТЕЛЯ (центр на планете), не следует за спутником;
      // полный вектор (x, y, z): наклон орбиты (у Луны 5,1° к эклиптике) сохраняется
      var points = [];
      var steps = 64;
      for (var k = 0; k <= steps; k++) {
        var d = new Date(Date.now() + (k / steps) * m.periodDays * 86400000);
        var pos = Kepler.positionAU(m.orbit, d);
        var r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        var R = Scales.moonOrbitRadius(m.displayOrbit, m.orbit.a, r);
        points.push(new THREE.Vector3(
          r > 0 ? pos.x / r * R : 0,
          r > 0 ? pos.y / r * R : 0,
          r > 0 ? pos.z / r * R : 0
        ));
      }
      var orbitLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: parseInt(m.color.slice(1), 16), transparent: true, opacity: 0.4
        })
      );
      host.add(orbitLine);

      host.add(orbitGroup);
      moonRecs.push({ def: m, orbitGroup: orbitGroup, mesh: mesh });
    });

    // ---------- Годовые аннотации орбиты Земли ----------
    // Кольца равноденствий/солнцестояний, точки апсид, крестик центра эллипса.
    // Перестраиваются при смене года.
    var markersGroup = new THREE.Group();
    scene.add(markersGroup);
    var markerYear = null;

    function earthWorldPos(date) {
      return placeOnOrbit(Orbital.earthPositionAU(date));
    }

    function rebuildMarkers(year) {
      while (markersGroup.children.length) {
        var child = markersGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
        markersGroup.remove(child);
      }
      var markers = Orbital.seasonMarkers(year);
      for (var i = 0; i < markers.length; i++) {
        var p = earthWorldPos(markers[i].date);
        // кольцо в плоскости орбиты: Земля проходит сквозь него в дату события
        var ring = new THREE.Mesh(
          new THREE.TorusGeometry(EARTH_RADIUS + 0.35, 0.12, 10, 48),
          new THREE.MeshBasicMaterial({ color: 0xe91e63 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, p.y, p.z);
        markersGroup.add(ring);
        var dd = markers[i].date.getUTCDate();
        var mm = markers[i].date.getUTCMonth() + 1;
        var label = makeTextSprite(
          [markers[i].name, (dd < 10 ? '0' : '') + dd + '.' + (mm < 10 ? '0' : '') + mm],
          [8, 4],
          ['#ffffff', '#ffd54f']
        );
        label.position.set(p.x * 1.17, 2.2, p.z * 1.17);
        markersGroup.add(label);
      }

      // Апсиды: точки на линии орбиты + подписи с расстоянием.
      // Солнце — в фокусе, поэтому в перигелии Земля ближе (147 млн км),
      // в афелии — дальше (152 млн км); орбита — эллипс, а не окружность.
      var apses = Orbital.apsisMarkers(year);
      var center = { x: 0, z: 0 };
      for (var a = 0; a < apses.length; a++) {
        var pa = earthWorldPos(apses[a].date);
        center.x += pa.x / 2;
        center.z += pa.z / 2;
        var dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x4dd0e1 })
        );
        dot.position.set(pa.x, pa.y, pa.z);
        markersGroup.add(dot);
        var ad = apses[a].date.getUTCDate();
        var am = apses[a].date.getUTCMonth() + 1;
        var dateStr = (ad < 10 ? '0' : '') + ad + '.' + (am < 10 ? '0' : '') + am;
        var distStr = (apses[a].r * Orbital.AU_KM).toFixed(1).replace('.', ',');
        var apsisLabel = makeTextSprite(
          [apses[a].name + ' · ' + dateStr, distStr + ' млн км'],
          [6, 3],
          ['#80deea', '#4dd0e1']
        );
        apsisLabel.position.set(pa.x * 1.3, -2.2, pa.z * 1.3);
        markersGroup.add(apsisLabel);
      }

      // Крестик — геометрический центр эллипса (отстоит от Солнца на a·e
      // в сторону афелия). Поднят над полюсом Солнца «булавкой»: точка
      // лежит внутри увеличенного (для наглядности) диска Солнца.
      var crossMat = new THREE.MeshBasicMaterial({ color: 0xb0bec5 });
      var armA = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.16), crossMat);
      var armB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.6), crossMat);
      armA.position.set(center.x, SUN_RADIUS + 0.2, center.z);
      armB.position.copy(armA.position);
      markersGroup.add(armA);
      markersGroup.add(armB);
      markerYear = year;
    }

    // ---------- Пояс астероидов ----------
    // Символический: частицы на кеплеровских круговых орбитах, углы — аналитически
    // от даты (без накопительного интегрирования), n ∝ a^−1,5 — внутренний край быстрее.
    var beltPoints = (function () {
      var rand = mulberry32(20260401);
      var count = Bodies.belt.count;
      var positions = new Float32Array(count * 3);
      var seeds = [];
      for (var i = 0; i < count; i++) {
        var a = Bodies.belt.aMin + rand() * (Bodies.belt.aMax - Bodies.belt.aMin);
        seeds.push({
          R: Scales.orbitRadius(a),
          theta0: rand() * Math.PI * 2,
          n: 2 * Math.PI / (Math.pow(a, 1.5) * 365.25), // рад/день
          y: (rand() - 0.5) * 1.6
        });
        positions[i * 3] = seeds[i].R;
        positions[i * 3 + 1] = seeds[i].y;
        positions[i * 3 + 2] = 0;
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var material = new THREE.PointsMaterial({
        color: BELT_COLOR, size: 0.4, sizeAttenuation: true
      });
      var points = new THREE.Points(geometry, material);
      points.userData.seeds = seeds;
      scene.add(points);
      return points;
    })();

    function updateBelt(date) {
      var d = Orbital.daysSinceJ2000(date);
      var seeds = beltPoints.userData.seeds;
      var arr = beltPoints.geometry.attributes.position.array;
      for (var i = 0; i < seeds.length; i++) {
        var theta = seeds[i].theta0 + seeds[i].n * d;
        arr[i * 3] = seeds[i].R * Math.cos(theta);
        arr[i * 3 + 1] = seeds[i].y;
        arr[i * 3 + 2] = seeds[i].R * Math.sin(theta);
      }
      beltPoints.geometry.attributes.position.needsUpdate = true;
    }

    scene.add(makeStars());

    var presets = {
      overview: { pos: [0, 24, 44], target: [0, 0, 0] },   // общий вид урока Земли
      top: { pos: [0, 62, 0.5], target: [0, 0, 0] },        // сверху на полюс
      side: { pos: [46, 2, 0], target: [0, 0, 0] }          // сбоку, в плоскости орбиты
    };

    function setCameraPreset(name) {
      var p = presets[name] || presets.overview;
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      controls.target.set(p.target[0], p.target[1], p.target[2]);
      controls.update();
    }

    // ---------- Слежение за выбранным телом ----------
    var targetId = 'sun';

    function getBodyWorldPosition(id) {
      if (id === 'sun' || !bodyMap[id]) return { x: 0, y: 0, z: 0 };
      var v = new THREE.Vector3();
      bodyMap[id].group.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    }

    function setTarget(id) {
      targetId = id;
      var wp = getBodyWorldPosition(id);
      var def = id === 'sun' ? { radius: SUN_RADIUS } : (Bodies.bodyById(id) || { radius: 1 });
      var dist = Math.max(def.radius * 6, 3.5);
      var dir = new THREE.Vector3(
        camera.position.x - controls.target.x,
        camera.position.y - controls.target.y,
        camera.position.z - controls.target.z
      );
      if (dir.length() < 0.001) dir.set(0, 0.6, 1);
      dir.normalize();
      camera.position.set(wp.x + dir.x * dist, wp.y + dir.y * dist, wp.z + dir.z * dist);
      controls.target.set(wp.x, wp.y, wp.z);
      controls.update();
    }

    function applyTracking() {
      if (targetId === 'sun') return;
      var wp = getBodyWorldPosition(targetId);
      var dx = wp.x - controls.target.x;
      var dy = wp.y - controls.target.y;
      var dz = wp.z - controls.target.z;
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
      controls.target.set(wp.x, wp.y, wp.z);
    }

    function update(date) {
      // планеты: позиции и вращение
      for (var id in bodyMap) {
        var rec = bodyMap[id];
        var wp = id === 'earth'
          ? earthWorldPos(date)
          : placeOnOrbit(Kepler.positionAU(rec.def.orbit, date));
        rec.group.position.set(wp.x, wp.y, wp.z);
        if (id !== 'earth' && rec.def.rotationHours) {
          rec.mesh.rotation.y = (date.getTime() / (rec.def.rotationHours * 3600000)) * Math.PI * 2;
        }
      }
      // Земля: вращение вокруг оси (сидерические сутки), сезонные метки по году
      earthRec.mesh.rotation.y = (date.getTime() / SIDEREAL_DAY_MS) * Math.PI * 2;
      var year = date.getUTCFullYear();
      if (year !== markerYear) rebuildMarkers(year);

      // спутники: локальные позиции в системах родителей (полный вектор — с наклоном орбиты)
      moonRecs.forEach(function (m) {
        var pos = Kepler.positionAU(m.def.orbit, date);
        var r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        var R = Scales.moonOrbitRadius(m.def.displayOrbit, m.def.orbit.a, r);
        m.orbitGroup.position.set(
          r > 0 ? pos.x / r * R : 0,
          r > 0 ? pos.y / r * R : 0,
          r > 0 ? pos.z / r * R : 0
        );
      });

      updateBelt(date);
      applyTracking();
    }

    var startDate = Date.now();
    setCameraPreset('overview');
    rebuildMarkers(new Date(startDate).getUTCFullYear());
    update(new Date(startDate));

    function render() {
      controls.update();
      renderer.render(scene, camera);
    }

    function resize() {
      var w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    return {
      update: update,
      render: render,
      resize: resize,
      setCameraPreset: setCameraPreset,
      setTarget: setTarget,
      getBodyWorldPosition: getBodyWorldPosition,
      camera: camera
    };
  }

  return {
    create: create,
    SCENE_SCALE: Scales.EARTH_UNITS, // мировых единиц на орбите Земли (преемственность)
    SUN_RADIUS: SUN_RADIUS
  };
});
