(() => {
    const installButton = document.getElementById('install-app-button');
    if (!installButton) return;

    const installHelp = document.getElementById('install-help');
    const installInstructions = document.getElementById('install-instructions');
    const closeInstallHelp = document.getElementById('close-install-help');
    if (!installHelp || !installInstructions || !closeInstallHelp) {
        console.error('No se encontró el cuadro de ayuda para instalar Biblioluch.');
        return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches
        || navigator.standalone === true;
    let installPrompt = null;

    if (!isInstalled) installButton.hidden = false;

    const showInstallHelp = () => {
        if (!window.isSecureContext) {
            installInstructions.textContent = 'Para instalar Biblioluch, abre la página desde una conexión segura HTTPS.';
        } else if (isIos) {
            installInstructions.textContent = 'En Safari, toca el botón Compartir y elige “Añadir a pantalla de inicio”.';
        } else {
            installInstructions.textContent = 'Abre el menú del navegador y elige “Instalar aplicación” o “Añadir a pantalla de inicio”.';
        }
        installHelp.showModal();
    };

    closeInstallHelp.addEventListener('click', () => installHelp.close());
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
    });

    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installButton.hidden = true;
    });

    installButton.addEventListener('click', async () => {
        if (!installPrompt) {
            showInstallHelp();
            return;
        }

        const prompt = installPrompt;
        installPrompt = null;
        try {
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === 'accepted') installButton.hidden = true;
        } catch (error) {
            console.error('No se pudo mostrar la instalación de Biblioluch:', error);
            showInstallHelp();
        }
    });

    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(error => console.error('No se pudo preparar la instalación de Biblioluch:', error));
    }
})();
