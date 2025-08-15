// static/js/components/settings.js

(function() {
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettingsBtn'); // Používáme ID pro spolehlivost
  const closeSettingsBtn = document.getElementById('settingsCloseBtn');

  // Pokud některý prvek neexistuje, skript se bezpečně ukončí
  if (!settingsModal || !openSettingsBtn || !closeSettingsBtn) {
    console.error("Settings modal components not found. Aborting initialization.");
    return;
  }

  // Funkce pro otevření modálního okna
  function openSettingsModal(event) {
    event.preventDefault(); // Zabrání přidání # do URL
    settingsModal.style.display = 'flex';
  }

  // Funkce pro zavření modálního okna
  function closeSettingsModal() {
    settingsModal.style.display = 'none';
  }

  // Navázání událostí
  openSettingsBtn.addEventListener('click', openSettingsModal);
  closeSettingsBtn.addEventListener('click', closeSettingsModal);

  // Zavření kliknutím na pozadí
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // Zavření klávesou Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
      closeSettingsModal();
    }
  });
})();