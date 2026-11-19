/* Окно «О базе данных»: свидетельство, авторское право, цитирование, финансирование. */
const AboutView = (() => {
  "use strict";

  const SITE_URL = "https://cities-analysis.github.io/map-dv-creative-industries/";
  // Латиница в APA: Ogleznev + a
  const CITATIONS = [
    {
      title: "База данных — ГОСТ",
      lang: "ru",
      text: () =>
        "Антонова И. С., Малеева Е. А., Оглезнева Е. А. Потенциал развития креативных индустрий Дальнего Востока на муниципальном и региональном уровнях : свидетельство о государственной регистрации базы данных № 2025626422 Российская Федерация ; правообладатель Национальный исследовательский Томский политехнический университет ; заявл. 12.12.2025 ; зарегистр. 23.12.2025.",
    },
    {
      title: "База данных — APA",
      lang: "en",
      text: () =>
        "Antonova, I. S., Maleeva, E. A., & Ogleznev" + "a, E. A. (2025). Potential for the development of creative industries of the Far East at the municipal and regional levels [Database]. National Research Tomsk Polytechnic University. Certificate of state registration of a database No. 2025626422 (Russian Federation).",
    },
    {
      title: "Интерактивная визуализация — ГОСТ",
      lang: "ru",
      text: () =>
        "Антонова И. С., Малеева Е. А., Оглезнева Е. А. Креативные индустрии Дальнего Востока : интерактивная карта [Электронный ресурс] / Национальный исследовательский Томский политехнический университет. 2026. URL: " +
        SITE_URL +
        " (дата обращения: " +
        new Date().toLocaleDateString("ru-RU") +
        ").",
    },
    {
      title: "Интерактивная визуализация — APA",
      lang: "en",
      text: () =>
        "Antonova, I. S., Maleeva, E. A., & Ogleznev" + "a, E. A. (2026). Creative industries of the Russian Far East: Interactive map [Data visualization]. National Research Tomsk Polytechnic University. " + SITE_URL,
    },
  ];

  const modal = document.getElementById("about-modal");
  const list = document.getElementById("cite-list");
  let lastFocus = null;

  function renderCitations() {
    list.innerHTML = "";
    for (const c of CITATIONS) {
      const box = document.createElement("div");
      box.className = "cite-box";
      const head = document.createElement("div");
      head.className = "cite-head";
      const label = document.createElement("span");
      label.textContent = c.title;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cite-copy";
      btn.textContent = "Скопировать";
      const p = document.createElement("p");
      p.lang = c.lang;
      p.textContent = c.text();
      btn.addEventListener("click", () => copy(p.textContent, btn));
      head.append(label, btn);
      box.append(head, p);
      list.appendChild(box);
    }
  }

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e2) {
        /* без буфера обмена текст можно выделить вручную */
      }
      ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = "Скопировано";
    setTimeout(() => (btn.textContent = old), 1600);
  }

  function open() {
    lastFocus = document.activeElement;
    renderCitations(); // дата обращения всегда актуальна
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    modal.querySelector(".modal-close").focus();
  }

  function close() {
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function init() {
    for (const id of ["about-open", "about-open-footer", "about-title"]) {
      const node = document.getElementById(id);
      if (!node) continue;
      node.addEventListener("click", open);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    }
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
    });
  }

  init();
  return { open, close };
})();
