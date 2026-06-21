// Category dropdown: filter games on index.html
// Expects:
// - Category menu items: a[data-category]
// - Game cards: .game-card with a .tag and/or h3 containing text

(function () {
  const onReady = () => {
    const searchInput = document.getElementById('search');
    const categoryLinks = Array.from(document.querySelectorAll('a[data-category]'));
    const cards = Array.from(document.querySelectorAll('.game-card'));

    if (!categoryLinks.length || !cards.length) return;

    const normalize = (s) => (s || '').toString().trim().toLowerCase();

    const setCardsVisible = (category) => {
      const cat = normalize(category);

      for (const card of cards) {
        // Prefer .tag text, fallback to title
        const tagEl = card.querySelector('.tag');
        const tagText = tagEl ? tagEl.textContent : '';

        const titleEl = card.querySelector('h3');
        const titleText = titleEl ? titleEl.textContent : '';

        const haystack = normalize(tagText + ' ' + titleText);
        const match = cat === '' || haystack.includes(cat);
        card.style.display = match ? '' : 'none';
      }
    };

    for (const link of categoryLinks) {
      link.addEventListener('click', (e) => {
        e.preventDefault();

        const category = link.getAttribute('data-category') || '';

        // Clear search box so category results are obvious
        if (searchInput) searchInput.value = '';

        setCardsVisible(category);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();

