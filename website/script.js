const nav = document.getElementById("topNav");
const yearEl = document.getElementById("year");

function updateNavState() {
  if (!nav) return;
  nav.classList.toggle("scrolled", window.scrollY > 8);
}

window.addEventListener("scroll", updateNavState, { passive: true });
updateNavState();

if (yearEl) yearEl.textContent = String(new Date().getFullYear());

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
