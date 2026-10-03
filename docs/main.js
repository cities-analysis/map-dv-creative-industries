(() => {
  "use strict";

  const tabs = [...document.querySelectorAll(".tab-btn")];
  const views = {
    map: document.getElementById("view-map"),
    charts: document.getElementById("view-charts"),
    ci: document.getElementById("view-ci"),
    regions: document.getElementById("view-regions"),
  };
  const modules = { map: MapView, charts: ChartsView, ci: CiView, regions: RegionsView };

  async function activate(name) {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    Object.entries(views).forEach(([key, viewEl]) => viewEl.classList.toggle("active", key === name));
    try {
      await modules[name].init();
      if (modules[name].onShow) modules[name].onShow();
    } catch (err) {
      console.error(err);
      views[name].innerHTML = `<p style="color:red;padding:20px">Ошибка загрузки: ${err.message}</p>`;
    }
  }

  tabs.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.tab)));

  activate("map");
})();
