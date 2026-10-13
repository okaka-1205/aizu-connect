const screens = {
  top: document.getElementById("top-screen"),
  harvest: document.getElementById("harvest-screen"),
  selection: document.getElementById("selection-screen"),
};

const titles = { top: "TOP", harvest: "収穫", selection: "選果" };
const titleButton = document.getElementById("page-title");

function showScreen(name, updateHistory = true) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.hidden = key !== name;
  });
  titleButton.textContent = titles[name];
  if (updateHistory) history.pushState({ screen: name }, "", `#${name}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

titleButton.addEventListener("click", () => showScreen("top"));

window.addEventListener("popstate", () => {
  const name = window.location.hash.slice(1);
  showScreen(screens[name] ? name : "top", false);
});

const initialScreen = window.location.hash.slice(1);
showScreen(screens[initialScreen] ? initialScreen : "top", false);
