const Social = {
    selectedUsers: new Map(),
    activeConversationId: null,
    senderNames: new Map(),
    realtimeChannel: null,
    renderVersion: 0,

    escape(value) {
        return App._escaparHTML(String(value ?? ''));
    },

    requireSession() {
        if (App.supabaseClient && App.estado.usuario) return true;
        App._mostrarAutenticacion(App.estado.vista === 'mensajes' ? 'mensajes' : 'perfil');
        return false;
    },

    async loadProfile(userId) {
        const { data, error } = await App.supabaseClient
            .from('profiles')
            .select('user_id,username,display_name,bio,school,avatar_path')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;
        if (data) return data;

        const displayName = App.estado.usuario.user_metadata?.display_name
            || App.estado.usuario.email?.split('@')[0]
            || 'Estudiante';
        const profile = {
            user_id: userId,
            username: `estudiante_${userId.replace(/-/g, '').slice(0, 10)}`,
            display_name: displayName,
            bio: '',
            school: ''
        };
        const { data: created, error: createError } = await App.supabaseClient
            .from('profiles')
            .upsert(profile, { onConflict: 'user_id' })
            .select('user_id,username,display_name,bio,school,avatar_path')
            .single();
        if (createError) throw createError;
        return created;
    },

    avatarUrl(path) {
        if (!path) return '';
        return App.supabaseClient.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
    },

    async renderProfile() {
        const version = ++this.renderVersion;
        if (!this.requireSession()) return;
        const main = document.getElementById('main-content');
        main.innerHTML = '<div class="config-card">Cargando perfil…</div>';
        try {
            const profile = await this.loadProfile(App.estado.usuario.id);
            if (version !== this.renderVersion || App.estado.vista !== 'perfil') return;
            const avatar = this.avatarUrl(profile.avatar_path);
            main.innerHTML = `
                <div class="page-enter social-page">
                    <header class="page-header">
                        <div><h1 class="page-title">Mi perfil</h1><p class="page-subtitle">Personaliza cómo te ven otros estudiantes.</p></div>
                    </header>
                    <form class="config-card profile-card" id="profile-form">
                        <div class="profile-avatar-row">
                            <img class="profile-avatar" id="profile-avatar-preview" src="${this.escape(avatar || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 rx=%2250%22 fill=%22%231a2a42%22/%3E%3Ctext x=%2250%22 y=%2265%22 text-anchor=%22middle%22 font-size=%2250%22 fill=%22%23f0a500%22%3E%E2%98%BA%3C/text%3E%3C/svg%3E')}" alt="Foto de perfil">
                            <label class="btn btn--outline profile-upload">Elegir foto
                                <input type="file" id="profile-avatar-file" accept="image/jpeg,image/png,image/webp" hidden>
                            </label>
                            <span class="profile-hint">JPG, PNG o WebP · máximo 5 MB</span>
                        </div>
                        <label class="libro-renombrar">Nombre de usuario
                            <span class="profile-username-input"><span>@</span><input class="input-num" name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" value="${this.escape(profile.username)}" autocomplete="username"></span>
                        </label>
                        <label class="libro-renombrar">Nombre para mostrar
                            <input class="input-num" name="display_name" required minlength="1" maxlength="80" value="${this.escape(profile.display_name)}" autocomplete="name">
                        </label>
                        <label class="libro-renombrar">Descripción
                            <textarea class="input-num social-textarea" name="bio" maxlength="240" rows="3" placeholder="Cuéntales a los demás qué estás estudiando…">${this.escape(profile.bio || '')}</textarea>
                        </label>
                        <label class="libro-renombrar">Universidad o colegio <span class="profile-hint">(opcional)</span>
                            <input class="input-num" name="school" maxlength="120" value="${this.escape(profile.school || '')}" placeholder="Nombre de tu institución">
                        </label>
                        <div class="social-form-footer"><p id="profile-message" class="auth-message" role="status"></p><button class="btn btn--gold" type="submit">Guardar perfil</button></div>
                    </form>
                </div>`;

            let avatarFile = null;
            document.getElementById('profile-avatar-file').addEventListener('change', event => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                    event.target.value = '';
                    document.getElementById('profile-message').textContent = 'Elige una imagen JPG, PNG o WebP de hasta 5 MB.';
                    return;
                }
                avatarFile = file;
                document.getElementById('profile-avatar-preview').src = URL.createObjectURL(file);
            });
            document.getElementById('profile-form').addEventListener('submit', async event => {
                event.preventDefault();
                const form = event.currentTarget;
                const button = form.querySelector('button[type="submit"]');
                const feedback = document.getElementById('profile-message');
                const fields = new FormData(form);
                button.disabled = true;
                feedback.textContent = 'Guardando cambios…';
                feedback.classList.remove('auth-message--error');
                let saveStep = 'profile';
                try {
                    let avatarPath = profile.avatar_path;
                    if (avatarFile) {
                        saveStep = 'avatar';
                        const extension = avatarFile.type === 'image/png' ? 'png' : avatarFile.type === 'image/webp' ? 'webp' : 'jpg';
                        avatarPath = `${App.estado.usuario.id}/avatar.${extension}`;
                        const { error: uploadError } = await App.supabaseClient.storage
                            .from('profile-avatars')
                            .upload(avatarPath, avatarFile, { upsert: true, contentType: avatarFile.type });
                        if (uploadError) throw uploadError;
                    }
                    saveStep = 'profile';
                    const updated = {
                        username: String(fields.get('username')).trim().toLowerCase(),
                        display_name: String(fields.get('display_name')).trim(),
                        bio: String(fields.get('bio')).trim(),
                        school: String(fields.get('school')).trim(),
                        avatar_path: avatarPath
                    };
                    const { data, error } = await App.supabaseClient.from('profiles')
                        .update(updated)
                        .eq('user_id', App.estado.usuario.id)
                        .select('user_id')
                        .maybeSingle();
                    if (error) throw error;
                    if (!data) throw new Error('No se encontró tu perfil. Recarga la página e inténtalo de nuevo.');
                    feedback.textContent = 'Perfil actualizado.';
                    feedback.classList.add('auth-message--success');
                    avatarFile = null;
                } catch (error) {
                    feedback.textContent = error.code === '23505'
                        ? 'Ese nombre de usuario ya está ocupado. Prueba con otro.'
                        : /row-level security policy/i.test(error.message || '')
                            ? saveStep === 'avatar'
                                ? 'Supabase bloqueó la foto de perfil. Ejecuta la versión actualizada de supabase/setup.sql en el SQL Editor de tu proyecto y vuelve a intentarlo.'
                                : 'Supabase bloqueó la actualización del perfil. Verifica que ejecutaste la versión actualizada de supabase/setup.sql en el SQL Editor de tu proyecto.'
                        : (error.message || 'No se pudo guardar el perfil.');
                    feedback.classList.add('auth-message--error');
                } finally {
                    button.disabled = false;
                }
            });
        } catch (error) {
            if (version !== this.renderVersion) return;
            main.innerHTML = `<div class="config-card"><h1 class="page-title">Mi perfil</h1><p class="config-error">No se pudo cargar el perfil: ${this.escape(error.message)}</p><p>Comprueba que ejecutaste la configuración actualizada de Supabase.</p></div>`;
        }
    },

    async renderMessages() {
        const version = ++this.renderVersion;
        if (!this.requireSession()) return;
        await this.removeRealtimeChannel();
        this.activeConversationId = null;
        this.selectedUsers.clear();
        const main = document.getElementById('main-content');
        main.innerHTML = '<div class="config-card">Cargando mensajes…</div>';
        try {
            const userId = App.estado.usuario.id;
            const { data: memberships, error: memberError } = await App.supabaseClient
                .from('conversation_members')
                .select('conversation_id')
                .eq('user_id', userId);
            if (memberError) throw memberError;
            const ids = (memberships || []).map(row => row.conversation_id);
            let conversations = [];
            if (ids.length) {
                const { data, error } = await App.supabaseClient
                    .from('conversations')
                    .select('id,title,is_group,updated_at')
                    .in('id', ids)
                    .order('updated_at', { ascending: false });
                if (error) throw error;
                conversations = data || [];
            }
            if (version !== this.renderVersion || App.estado.vista !== 'mensajes') return;
            main.innerHTML = `
                <div class="page-enter social-page">
                    <header class="page-header"><div><h1 class="page-title">Mensajes</h1><p class="page-subtitle">Conversa en privado o crea un grupo de estudio.</p></div></header>
                    <div class="messages-layout">
                        <aside class="config-card messages-sidebar">
                            <h2>Iniciar conversación</h2>
                            <form id="people-search" class="people-search">
                                <input class="input-num" name="username" maxlength="24" placeholder="Buscar por @usuario" aria-label="Buscar por nombre de usuario">
                                <button class="btn btn--outline" type="submit">Buscar</button>
                            </form>
                            <div id="people-results" class="people-results" aria-live="polite"></div>
                            <form id="group-create-form" class="group-create-form">
                                <label class="libro-renombrar">Nombre del grupo
                                    <input class="input-num" name="title" maxlength="80" required placeholder="Ej. Estudio de Penal">
                                </label>
                                <button class="btn btn--gold" type="submit" disabled id="create-group-button">Crear grupo con seleccionados</button>
                            </form>
                            <h2 class="messages-heading">Tus conversaciones</h2>
                            <div class="conversation-list">
                                ${conversations.length ? conversations.map(conversation => `
                                    <button type="button" class="conversation-item" data-conversation-id="${this.escape(conversation.id)}">
                                        <span class="conversation-avatar">${conversation.is_group ? '👥' : '💬'}</span>
                                        <span><strong>${this.escape(conversation.title)}</strong><small>${conversation.is_group ? 'Grupo' : 'Privado'}</small></span>
                                    </button>`).join('') : '<p class="profile-hint">Todavía no tienes conversaciones. Busca estudiantes por nombre de usuario.</p>'}
                            </div>
                        </aside>
                        <section class="config-card conversation-panel" id="conversation-panel">
                            <div class="conversation-empty"><span>💬</span><h2>Tu espacio de conversación</h2><p>Elige un chat existente o busca a otro estudiante para empezar.</p></div>
                        </section>
                    </div>
                </div>`;
            document.getElementById('people-search').addEventListener('submit', event => this.searchPeople(event));
            document.getElementById('group-create-form').addEventListener('submit', event => this.createGroup(event));
            document.querySelectorAll('[data-conversation-id]').forEach(button => {
                button.addEventListener('click', () => this.openConversation(button.dataset.conversationId));
            });
        } catch (error) {
            if (version !== this.renderVersion) return;
            main.innerHTML = `<div class="config-card"><h1 class="page-title">Mensajes</h1><p class="config-error">No se pudieron cargar las conversaciones: ${this.escape(error.message)}</p><p>Comprueba que ejecutaste la configuración actualizada de Supabase.</p></div>`;
        }
    },

    async searchPeople(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const username = String(new FormData(form).get('username') || '').trim().replace(/^@/, '').toLowerCase();
        const results = document.getElementById('people-results');
        results.innerHTML = '';
        if (username.length < 2) {
            results.textContent = 'Escribe al menos 2 caracteres del nombre de usuario.';
            return;
        }
        try {
            const { data, error } = await App.supabaseClient.from('profiles')
                .select('user_id,username,display_name,bio,school,avatar_path')
                .ilike('username', `${username}%`)
                .neq('user_id', App.estado.usuario.id)
                .order('username')
                .limit(8);
            if (error) throw error;
            if (!data.length) {
                results.textContent = 'No encontramos estudiantes con ese nombre de usuario.';
                return;
            }
            results.innerHTML = data.map(profile => `
                <div class="person-result">
                    <span class="conversation-avatar">${this.escape((profile.display_name || profile.username).slice(0, 1).toUpperCase())}</span>
                    <span class="person-result__details"><strong>${this.escape(profile.display_name)}</strong><small>@${this.escape(profile.username)}</small></span>
                    <button class="btn btn--outline btn--small" type="button" data-start-chat="${this.escape(profile.user_id)}" data-person-name="${this.escape(profile.display_name)}">Chat</button>
                    <label class="person-select" title="Seleccionar para el grupo"><input type="checkbox" data-select-person="${this.escape(profile.user_id)}" aria-label="Añadir a grupo: ${this.escape(profile.display_name)}"></label>
                </div>`).join('');
            results.querySelectorAll('[data-start-chat]').forEach(button => {
                button.addEventListener('click', () => this.createConversation([button.dataset.startChat], button.dataset.personName, false));
            });
            results.querySelectorAll('[data-select-person]').forEach(input => {
                input.addEventListener('change', () => {
                    const profile = data.find(item => item.user_id === input.dataset.selectPerson);
                    if (!profile) return;
                    if (input.checked) this.selectedUsers.set(profile.user_id, profile);
                    else this.selectedUsers.delete(profile.user_id);
                    document.getElementById('create-group-button').disabled = this.selectedUsers.size < 2;
                    document.getElementById('create-group-button').textContent = `Crear grupo con seleccionados (${this.selectedUsers.size})`;
                });
            });
        } catch (error) {
            results.textContent = `No se pudo buscar: ${error.message}`;
        }
    },

    async createConversation(participantIds, title, isGroup) {
        try {
            const { data, error } = await App.supabaseClient.rpc('create_conversation', {
                p_participant_ids: participantIds,
                p_title: title,
                p_is_group: isGroup
            });
            if (error) throw error;
            await this.renderMessages();
            await this.openConversation(data);
        } catch (error) {
            const results = document.getElementById('people-results');
            if (results) results.textContent = `No se pudo crear la conversación: ${error.message}`;
        }
    },

    async createGroup(event) {
        event.preventDefault();
        if (this.selectedUsers.size < 2) return;
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        const title = String(new FormData(form).get('title') || '').trim();
        try {
            await this.createConversation([...this.selectedUsers.keys()], title, true);
        } finally {
            if (document.getElementById('create-group-button')) {
                document.getElementById('create-group-button').disabled = this.selectedUsers.size < 2;
            }
        }
    },

    async openConversation(conversationId) {
        this.activeConversationId = conversationId;
        await this.removeRealtimeChannel();
        const panel = document.getElementById('conversation-panel');
        if (!panel) return;
        panel.innerHTML = '<p class="profile-hint">Cargando mensajes…</p>';
        try {
            const { data: conversation, error: conversationError } = await App.supabaseClient
                .from('conversations')
                .select('id,title,is_group')
                .eq('id', conversationId)
                .single();
            if (conversationError) throw conversationError;
            const { data: messages, error } = await App.supabaseClient
                .from('messages')
                .select('id,conversation_id,sender_id,content,created_at')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            const { data: members, error: membersError } = await App.supabaseClient
                .from('conversation_members')
                .select('user_id')
                .eq('conversation_id', conversationId);
            if (membersError) throw membersError;
            const memberIds = (members || []).map(member => member.user_id);
            const { data: profiles, error: profilesError } = await App.supabaseClient
                .from('profiles')
                .select('user_id,display_name,username')
                .in('user_id', memberIds);
            if (profilesError) throw profilesError;
            if (conversationId !== this.activeConversationId || !document.getElementById('conversation-panel')) return;
            this.senderNames = new Map((profiles || []).map(profile => [
                profile.user_id,
                profile.display_name || `@${profile.username}`
            ]));
            const latestMessages = (messages || []).reverse();
            panel.innerHTML = `
                <header class="conversation-header"><div><h2>${this.escape(conversation.title)}</h2><p>${conversation.is_group ? 'Chat grupal' : 'Chat privado'} · mensajes en tiempo real</p></div></header>
                <div class="message-list" id="message-list" aria-live="polite">
                    ${latestMessages.map(message => this.renderMessage(message)).join('')}
                    ${latestMessages.length ? '' : '<p class="conversation-empty__hint">Este chat está listo. Envía el primer mensaje.</p>'}
                </div>
                <form class="message-form" id="message-form">
                    <input class="input-num" name="content" maxlength="4000" required autocomplete="off" placeholder="Escribe un mensaje…" aria-label="Escribe un mensaje">
                    <button class="btn btn--gold" type="submit">Enviar</button>
                </form>`;
            const list = document.getElementById('message-list');
            list.scrollTop = list.scrollHeight;
            document.getElementById('message-form').addEventListener('submit', event => this.sendMessage(event, conversationId));
            this.realtimeChannel = App.supabaseClient.channel(`messages:${conversationId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${conversationId}`
                }, payload => this.appendMessage(payload.new))
                .subscribe((status, error) => {
                    if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && this.activeConversationId === conversationId) {
                        const notice = document.createElement('p');
                        notice.className = 'config-error';
                        notice.textContent = `No se pudo conectar la actualización en tiempo real${error?.message ? `: ${error.message}` : '. Comprueba la publicación supabase_realtime.'}`;
                        document.getElementById('conversation-panel')?.prepend(notice);
                    }
                });
        } catch (error) {
            panel.innerHTML = `<p class="config-error">No se pudieron abrir los mensajes: ${this.escape(error.message)}</p>`;
        }
    },

    renderMessage(message) {
        const own = message.sender_id === App.estado.usuario.id;
        const sender = own ? 'Tú' : (this.senderNames.get(message.sender_id) || 'Estudiante');
        return `<article class="message-bubble${own ? ' message-bubble--own' : ''}" data-message-id="${this.escape(message.id)}"><strong class="message-sender">${this.escape(sender)}</strong><p>${this.escape(message.content)}</p><time>${new Date(message.created_at).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}</time></article>`;
    },

    appendMessage(message) {
        if (message.conversation_id !== this.activeConversationId) return;
        const list = document.getElementById('message-list');
        if (!list || list.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)) return;
        list.insertAdjacentHTML('beforeend', this.renderMessage(message));
        list.scrollTop = list.scrollHeight;
    },

    async sendMessage(event, conversationId) {
        event.preventDefault();
        const form = event.currentTarget;
        const input = form.elements.namedItem('content');
        const content = String(input.value || '').trim();
        if (!content) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const { data, error } = await App.supabaseClient.from('messages')
                .insert({ conversation_id: conversationId, sender_id: App.estado.usuario.id, content })
                .select('id,conversation_id,sender_id,content,created_at')
                .single();
            if (error) throw error;
            input.value = '';
            this.appendMessage(data);
        } catch (error) {
            const panel = document.getElementById('conversation-panel');
            if (panel) {
                const notice = document.createElement('p');
                notice.className = 'config-error';
                notice.textContent = `No se pudo enviar el mensaje: ${error.message}`;
                form.before(notice);
            }
        } finally {
            button.disabled = false;
            input.focus();
        }
    },

    async removeRealtimeChannel() {
        if (!this.realtimeChannel) return;
        const channel = this.realtimeChannel;
        this.realtimeChannel = null;
        await App.supabaseClient.removeChannel(channel);
    }
};

const navigateApp = App.navegarA.bind(App);
App.navegarA = function (vista, params = {}) {
    navigateApp(vista, params);
    if (vista !== 'mensajes') Social.removeRealtimeChannel();
    if (this.estado.vista === 'auth') return;
    if (vista !== 'perfil' && vista !== 'mensajes') return;
    this.estado.vista = vista;
    document.querySelectorAll('[data-nav]').forEach(element => {
        element.classList.toggle('active', element.dataset.nav === vista);
    });
    if (vista === 'perfil') Social.renderProfile();
    else Social.renderMessages();
};

window.addEventListener('beforeunload', () => {
    if (Social.realtimeChannel && App.supabaseClient) App.supabaseClient.removeChannel(Social.realtimeChannel);
});

document.querySelectorAll('[data-nav="perfil"], [data-nav="mensajes"]').forEach(element => {
    element.addEventListener('click', event => {
        event.preventDefault();
        App.navegarA(element.dataset.nav);
    });
});
