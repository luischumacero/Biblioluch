const PushNotifications = {
    _base64UrlToBytes(value) {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
        return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    },

    bindEnableButton() {
        const button = document.getElementById('enable-push-notifications');
        const status = document.getElementById('push-notification-status');
        if (!button || !status) return;
        button.addEventListener('click', async () => {
            button.disabled = true;
            status.classList.remove('notification-status--error', 'notification-status--success');
            status.textContent = 'Activando notificaciones…';
            try {
                if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                    throw new Error('Este navegador no admite notificaciones push.');
                }
                if (!window.isSecureContext) {
                    throw new Error('Las notificaciones solo funcionan desde HTTPS o localhost.');
                }
                const publicKey = App.supabaseConfig?.vapidPublicKey;
                if (!publicKey) {
                    throw new Error('Falta configurar la clave pública VAPID en js/supabase-config.js.');
                }
                const permission = Notification.permission === 'granted'
                    ? 'granted'
                    : await Notification.requestPermission();
                if (permission !== 'granted') throw new Error('No se concedió permiso para mostrar notificaciones.');

                const registration = await navigator.serviceWorker.ready;
                if (!registration.pushManager) throw new Error('Este navegador no admite notificaciones push.');
                let subscription = await registration.pushManager.getSubscription();
                if (!subscription) {
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: this._base64UrlToBytes(publicKey)
                    });
                }
                const { error } = await App.supabaseClient.from('push_subscriptions').upsert({
                    user_id: App.estado.usuario.id,
                    endpoint: subscription.endpoint,
                    subscription: subscription.toJSON(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'endpoint' });
                if (error) throw error;
                status.textContent = 'Notificaciones activadas en este dispositivo.';
                status.classList.add('notification-status--success');
            } catch (error) {
                status.textContent = error.message || 'No se pudieron activar las notificaciones.';
                status.classList.add('notification-status--error');
            } finally {
                button.disabled = false;
            }
        });
    },

    async notifyMessage(messageId) {
        const { data, error } = await App.supabaseClient.functions.invoke('notifications', {
            body: { action: 'message', messageId }
        });
        if (error) throw error;
        if (!data || data.error) throw new Error(data?.error || 'El servidor no confirmó el envío.');
        return data;
    },

    async describeFunctionError(error) {
        const response = error?.context;
        if (!(response instanceof Response)) return error?.message || 'Error desconocido.';
        let detail = '';
        try {
            const payload = await response.clone().json();
            detail = payload.error || payload.message || '';
        } catch {
            try {
                detail = (await response.clone().text()).slice(0, 500);
            } catch (readError) {
                console.error('No se pudo leer el detalle del error de Edge Function:', readError);
            }
        }
        return `Error ${response.status} de la función${detail ? `: ${detail}` : ` (${response.statusText || 'sin detalles'})`}`;
    },

    async unsubscribeCurrentDevice() {
        if (!('serviceWorker' in navigator) || !App.estado.usuario) return;
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration?.pushManager) return;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const { error } = await App.supabaseClient.from('push_subscriptions')
            .delete()
            .eq('endpoint', subscription.endpoint)
            .eq('user_id', App.estado.usuario.id);
        if (error) throw error;
        await subscription.unsubscribe();
    }
};
