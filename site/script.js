(function () {
  var button = document.querySelector('[data-menu-btn]');
  var nav = document.querySelector('[data-nav]');
  if (!button || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.textContent = open ? 'Close' : 'Menu';
  }

  button.addEventListener('click', function () {
    setOpen(!nav.classList.contains('open'));
  });

  nav.addEventListener('click', function (event) {
    if (event.target.tagName === 'A') setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });
})();
