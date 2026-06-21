// js/script.js
// Search filter for GameVault (works on GitHub Pages + locally)

(function () {
  const onReady = () => {
    const searchInput = document.getElementById('search');
    const cards = Array.from(document.querySelectorAll('.game-card'));

    // Prevent null/script errors
    if (!searchInput || cards.length === 0) return;

    // Instant filtering while typing
    searchInput.addEventListener('input', () => {
      const filter = searchInput.value.trim().toLowerCase();

      for (const card of cards) {
        const titleEl = card.querySelector('h3');
        const title = titleEl ? titleEl.textContent.toLowerCase() : '';

        // show all when empty
        const match = filter === '' || title.includes(filter);
        card.style.display = match ? '' : 'none';
      }
    });
  };

  // Since script is loaded with defer, DOM is already parsed soon after.
  // Still keep it safe.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();

