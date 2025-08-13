// Sidebar active link highlight
document.addEventListener('DOMContentLoaded', () => {
  // normalizace cesty: bez trailing slash
  const current = (location.pathname.replace(/\/+$/,'') || '/') ;

  document.querySelectorAll('.sidebar a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('/')) return;            // přeskoč #/externí

    const path = (href.replace(/\/+$/,'') || '/');

    // pravidla: přesná shoda, případně root => /dashboard
    const isMatch =
      current === path ||
      (current === '/' && path === '/dashboard');

    if (isMatch) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  });
});
