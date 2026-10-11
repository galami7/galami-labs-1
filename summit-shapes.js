window.galamiSummitTriangles = {
  key: "galami-summit-triangles",
  names: ["Rigi", "Pilatus", "Matterhorn"],
  defaults: [
    [[0.189, 0.329], [0.04, 0.61], [0.32, 0.57]],
    [[0.48, 0.273], [0.34, 0.6], [0.65, 0.55]],
    [[0.815, 0.222], [0.71, 0.52], [0.94, 0.47]],
  ],
  valid(points) {
    return Array.isArray(points)
      && points.length === 3
      && points.every((triangle) => Array.isArray(triangle)
        && triangle.length === 3
        && triangle.every((pair) => Array.isArray(pair)
          && pair.length === 2
          && pair.every((value) => typeof value === "number" && Number.isFinite(value))));
  },
  read() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key));
      if (this.valid(saved)) return saved.map((triangle) => triangle.map((pair) => pair.slice()));
    } catch (error) {}
    return this.defaults.map((triangle) => triangle.map((pair) => pair.slice()));
  },
  save(points) {
    if (!this.valid(points)) return;
    localStorage.setItem(this.key, JSON.stringify(points));
  },
  clear() {
    localStorage.removeItem(this.key);
  },
};
