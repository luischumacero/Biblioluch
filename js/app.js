/**
 * app.js — Controlador principal de la Biblioteca Virtual
 * Gestiona el estado, las vistas y coordina parser + quiz engine.
 */

const App = {

    // ─── Estado global ────────────────────────────────────────
    estado: {
        vista: 'biblioteca',
        leyActualId: null,
        estructura: null,
        quizConfig: null,
        preguntas: [],
        preguntaIndex: 0,
        respuestas: [],          // { respuesta, correcta, pregunta }
        respondidaActual: false,
        cargando: false,
        librosPDF: [],
        librosComunidad: [],
        grupoComunidad: null,
        usuario: null,
        passwordRecovery: false,
        vistaDespuesDeAuth: 'libros-pdf',
        favoritos: JSON.parse(localStorage.getItem('bibliolex_favs') || '{}'),
        estadisticas: JSON.parse(localStorage.getItem('bibliolex_stats') || '{}')
    },

    supabaseClient: null,
    supabaseConfig: null,

    toggleFavorito(leyId, artNumero, variante) {
        if (!this.estado.favoritos) this.estado.favoritos = {};
        if (!this.estado.favoritos[leyId]) this.estado.favoritos[leyId] = [];
        const f = this.estado.favoritos[leyId];
        const key = artNumero + (variante ? '-' + variante : '');
        const idx = f.indexOf(key);
        if (idx === -1) {
            f.push(key);
        } else {
            f.splice(idx, 1);
        }
        localStorage.setItem('bibliolex_favs', JSON.stringify(this.estado.favoritos));
    },

    parser: null,
    engine: null,

    // ─── Inicialización ───────────────────────────────────────
    async init() {
        this.parser = new PDFParser();
        this.engine = new QuizEngine();
        this._attachSidebarEvents();
        await this._inicializarSupabase();
        if (this.supabaseClient && !this.estado.usuario) {
            this._mostrarAutenticacion('biblioteca');
            return;
        }
        this.navegarA('biblioteca');
    },

    async _inicializarSupabase() {
        const config = window.BIBLIOLUCH_SUPABASE_CONFIG;
        if (!config || !/^https:\/\/[^/]+\.supabase\.co$/i.test(config.url) ||
            !config.anonKey || config.anonKey === 'TU_CLAVE_PUBLICA_ANON') {
            return;
        }
        if (!window.supabase?.createClient) {
            throw new Error('No se pudo cargar Supabase JS. Revisa tu conexión a internet e inténtalo de nuevo.');
        }

        this.supabaseConfig = config;
        this.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
        const { data, error } = await this.supabaseClient.auth.getSession();
        if (error) throw new Error(`No se pudo recuperar la sesión de Supabase: ${error.message}`);
        this.estado.usuario = data.session?.user || null;

        this.supabaseClient.auth.onAuthStateChange((event, session) => {
            this.estado.usuario = session?.user || null;
            this._actualizarCuentaSupabase();
            if (event === 'PASSWORD_RECOVERY') {
                this.estado.passwordRecovery = true;
                this.navegarA('password-reset');
                return;
            }
            if (!this.estado.usuario && this.estado.vista !== 'auth') {
                this._mostrarAutenticacion('biblioteca');
            } else if (this.estado.usuario && event === 'SIGNED_IN' && this.estado.vista === 'auth') {
                this.navegarA(this.estado.vistaDespuesDeAuth || 'biblioteca');
            }
        });
        this._actualizarCuentaSupabase();
    },

    _attachSidebarEvents() {
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const destino = el.dataset.nav;
                if (destino === 'biblioteca') this.navegarA('biblioteca');
                if (destino === 'quiz-config') this.navegarA('quiz-config');
                if (destino === 'libros-pdf') this.navegarA('libros-pdf');
                if (destino === 'comunidad') this.navegarA('comunidad');
            });
        });

        document.getElementById('btn-importar-libro')?.addEventListener('click', () => {
            this._abrirSelectorImportacion();
        });
        document.getElementById('input-libro-pdf')?.addEventListener('change', async event => {
            const archivo = event.target.files?.[0];
            event.target.value = '';
            if (archivo) await this._importarLibroPDF(archivo);
        });
        document.getElementById('btn-auth-action')?.addEventListener('click', async () => {
            if (this.estado.usuario) await this._cerrarSesion();
            else this._mostrarAutenticacion('libros-pdf');
        });

        // Theme initialization
        const savedTheme = localStorage.getItem('bibliolex_theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('theme-dark');
            const btn = document.getElementById('btn-toggle-theme');
            if (btn) btn.textContent = '☀️ Modo claro';
        }

        document.getElementById('btn-toggle-theme')?.addEventListener('click', (e) => {
            const isDark = document.body.classList.toggle('theme-dark');
            localStorage.setItem('bibliolex_theme', isDark ? 'dark' : 'light');
            e.currentTarget.textContent = isDark ? '☀️ Modo claro' : '🌙 Modo oscuro';
        });

        // Toggle sidebar on mobile
        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('sidebar--open');
        });

        // Botón de limpiar caché (fuerza re-parseo de todos los PDFs)
        document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
            const claves = Object.keys(localStorage).filter(k => k.startsWith('bibliolex_'));
            claves.forEach(k => localStorage.removeItem(k));
            this.estado.estructura = null;
            this.estado.leyActualId = null;
            const btn = document.getElementById('btn-clear-cache');
            if (btn) {
                btn.textContent = '✅ Caché limpiado';
                btn.style.color = 'var(--green)';
                setTimeout(() => {
                    btn.textContent = '🗑️ Limpiar caché PDFs';
                    btn.style.color = '';
                }, 2500);
            }
        });
    },

    navegarA(vista, params = {}) {
        if (this.supabaseClient && !this.estado.usuario && vista !== 'auth') {
            this.estado.vistaDespuesDeAuth = vista;
            vista = 'auth';
            params = {};
        }
        this.estado.vista = vista;

        // Actualizar nav activo
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.classList.toggle('active', el.dataset.nav === vista);
        });

        // Renderizar la vista correspondiente
        switch (vista) {
            case 'biblioteca':    this._renderBiblioteca(); break;
            case 'libros-pdf':    this._renderLibrosPDF(); break;
            case 'comunidad':    this._renderComunidad(params.groupId); break;
            case 'auth':          this._renderAutenticacion(); break;
            case 'password-reset': this._renderRestablecerContrasena(); break;
            case 'lector':        this._renderLector(params.leyId); break;
            case 'quiz-config':   this._renderQuizConfig(params.leyId); break;
            case 'quiz':          this._renderQuiz(); break;
            case 'resultados':    this._renderResultados(); break;
        }
    },

    _actualizarCuentaSupabase() {
        document.body.classList.toggle(
            'auth-required',
            Boolean(this.supabaseClient && !this.estado.usuario)
        );
        const account = document.getElementById('supabase-account');
        const button = document.getElementById('btn-auth-action');
        if (!account || !button) return;
        if (!this.supabaseConfig) {
            account.textContent = '';
            button.hidden = true;
            return;
        }
        account.textContent = this.estado.usuario?.email || '';
        button.hidden = false;
        button.textContent = this.estado.usuario ? 'Cerrar sesión' : 'Iniciar sesión';
    },

    _abrirSelectorImportacion() {
        if (this.supabaseConfig && !this.estado.usuario) {
            this._mostrarAutenticacion('libros-pdf');
            return;
        }
        document.getElementById('input-libro-pdf')?.click();
    },

    _mostrarAutenticacion(vistaDestino = 'libros-pdf') {
        this.estado.vistaDespuesDeAuth = vistaDestino;
        this.navegarA('auth');
    },

    _renderAutenticacion() {
        const main = document.getElementById('main-content');
        const configurado = Boolean(this.supabaseClient);
        main.innerHTML = `
            <div class="auth-wrap page-enter">
                <div class="config-card auth-card">
                    <div class="auth-brand">
                        <div class="auth-brand__logo" aria-hidden="true">⚖️</div>
                        <p class="auth-brand__eyebrow">BIBLIOLUCH</p>
                        <h1 class="page-title">Tu espacio para estudiar</h1>
                        <p class="page-subtitle">Ingresa a tu cuenta para continuar con tus libros, grupos y conversaciones.</p>
                    </div>
                    ${configurado ? `
                        <form id="auth-form" class="auth-form">
                            <label class="libro-renombrar" id="auth-display-name-field" hidden>Nombre completo
                                <input class="input-num" type="text" name="displayName" autocomplete="name" maxlength="80" placeholder="¿Cómo te llamas?">
                            </label>
                            <label class="libro-renombrar">Correo electrónico
                                <input class="input-num" type="email" name="email" autocomplete="email" required placeholder="tu@correo.com">
                            </label>
                            <label class="libro-renombrar">Contraseña
                                <span class="auth-password">
                                    <input class="input-num" id="auth-password" type="password" name="password" autocomplete="current-password" minlength="6" required placeholder="Mínimo 6 caracteres">
                                    <button class="auth-password__toggle" type="button" id="auth-password-toggle" aria-label="Mostrar contraseña" aria-pressed="false">Mostrar</button>
                                </span>
                            </label>
                            <button class="auth-link auth-forgot" type="button" id="auth-forgot">¿Olvidaste tu contraseña?</button>
                            <button class="btn btn--gold auth-submit" type="submit" id="auth-submit">Iniciar sesión</button>
                            <p id="auth-message" class="auth-message" role="status"></p>
                            <p class="auth-switch"><span id="auth-switch-prompt">¿Aún no tienes cuenta?</span>
                                <button class="auth-link" type="button" id="auth-mode-toggle">Crear una cuenta</button>
                            </p>
                        </form>
                    ` : `
                        <div class="auth-setup-note">
                            <strong>Falta configurar Supabase.</strong>
                            <p>Completa <code>js/supabase-config.js</code> y ejecuta <code>supabase/setup.sql</code> en el editor SQL de tu proyecto.</p>
                        </div>
                    `}
                </div>
            </div>
        `;
        const form = document.getElementById('auth-form');
        if (!form) return;
        let mode = 'login';
        const passwordInput = document.getElementById('auth-password');
        const displayNameInput = form.elements.namedItem('displayName');
        const displayNameField = document.getElementById('auth-display-name-field');
        const submitButton = document.getElementById('auth-submit');
        const setMessage = (text, isError = false) => {
            const message = document.getElementById('auth-message');
            message.textContent = text;
            message.classList.toggle('auth-message--error', isError);
            message.classList.toggle('auth-message--success', Boolean(text) && !isError);
        };
        const updateMode = () => {
            const signup = mode === 'signup';
            displayNameField.hidden = !signup;
            displayNameInput.required = signup;
            passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
            submitButton.textContent = signup ? 'Crear mi cuenta' : 'Iniciar sesión';
            document.getElementById('auth-mode-toggle').textContent = signup ? 'Iniciar sesión' : 'Crear una cuenta';
            document.getElementById('auth-switch-prompt').textContent = signup ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?';
            document.getElementById('auth-forgot').hidden = signup;
            setMessage('');
        };
        document.getElementById('auth-mode-toggle').addEventListener('click', () => {
            mode = mode === 'login' ? 'signup' : 'login';
            updateMode();
        });
        document.getElementById('auth-password-toggle').addEventListener('click', event => {
            const button = event.currentTarget;
            const showing = passwordInput.type === 'password';
            passwordInput.type = showing ? 'text' : 'password';
            button.textContent = showing ? 'Ocultar' : 'Mostrar';
            button.setAttribute('aria-label', showing ? 'Ocultar contraseña' : 'Mostrar contraseña');
            button.setAttribute('aria-pressed', String(showing));
        });
        document.getElementById('auth-forgot').addEventListener('click', async () => {
            const email = String(form.elements.namedItem('email').value || '').trim();
            if (!email) {
                setMessage('Escribe tu correo electrónico para enviarte el enlace de recuperación.', true);
                form.elements.namedItem('email').focus();
                return;
            }
            const button = document.getElementById('auth-forgot');
            button.disabled = true;
            setMessage('Enviando enlace de recuperación…');
            try {
                const { error } = await this.supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}${window.location.pathname}`
                });
                if (error) throw error;
                setMessage('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
            } catch (error) {
                setMessage(error.message || 'No se pudo enviar el enlace de recuperación.', true);
            } finally {
                button.disabled = false;
            }
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const formData = new FormData(form);
            const email = String(formData.get('email') || '').trim();
            const password = String(formData.get('password') || '');
            submitButton.disabled = true;
            setMessage('');

            try {
                if (mode === 'signup') {
                    const { data, error } = await this.supabaseClient.auth.signUp({
                        email,
                        password,
                        options: {
                            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
                            data: { display_name: String(formData.get('displayName') || '').trim() }
                        }
                    });
                    if (error) throw error;
                    if (data.session) {
                        this.estado.usuario = data.session.user;
                        this._actualizarCuentaSupabase();
                        this.navegarA(this.estado.vistaDespuesDeAuth);
                    } else {
                        setMessage('¡Cuenta creada! Revisa tu correo y confirma la dirección para poder iniciar sesión.');
                    }
                } else {
                    const { data, error } = await this.supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    this.estado.usuario = data.user;
                    this._actualizarCuentaSupabase();
                    this.navegarA(this.estado.vistaDespuesDeAuth);
                }
            } catch (error) {
                setMessage(error.message || 'No se pudo completar la autenticación.', true);
            } finally {
                submitButton.disabled = false;
            }
        });
    },

    _renderRestablecerContrasena() {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="auth-wrap page-enter">
                <form class="config-card auth-card auth-form" id="password-reset-form">
                    <div class="auth-brand">
                        <div class="auth-brand__logo" aria-hidden="true">⚖️</div>
                        <p class="auth-brand__eyebrow">BIBLIOLUCH</p>
                        <h1 class="page-title">Crea una nueva contraseña</h1>
                        <p class="page-subtitle">Elige una contraseña nueva para proteger tu cuenta.</p>
                    </div>
                    <label class="libro-renombrar">Nueva contraseña
                        <input class="input-num" type="password" name="password" autocomplete="new-password" minlength="6" required>
                    </label>
                    <label class="libro-renombrar">Repite la contraseña
                        <input class="input-num" type="password" name="confirmation" autocomplete="new-password" minlength="6" required>
                    </label>
                    <button class="btn btn--gold" type="submit">Guardar contraseña</button>
                    <p id="password-reset-message" class="auth-message" role="status"></p>
                </form>
            </div>`;
        document.getElementById('password-reset-form').addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const fields = new FormData(form);
            const password = String(fields.get('password') || '');
            const message = document.getElementById('password-reset-message');
            if (password !== String(fields.get('confirmation') || '')) {
                message.textContent = 'Las contraseñas no coinciden.';
                message.classList.add('auth-message--error');
                return;
            }
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            message.textContent = 'Actualizando contraseña…';
            try {
                const { error } = await this.supabaseClient.auth.updateUser({ password });
                if (error) throw error;
                this.estado.passwordRecovery = false;
                message.textContent = 'Contraseña actualizada. Entrando a tu cuenta…';
                message.classList.add('auth-message--success');
                setTimeout(() => this.navegarA('biblioteca'), 900);
            } catch (error) {
                message.textContent = error.message || 'No se pudo actualizar la contraseña.';
                message.classList.add('auth-message--error');
                button.disabled = false;
            }
        });
    },

    async _cerrarSesion() {
        if (!this.supabaseClient) return;
        const { error } = await this.supabaseClient.auth.signOut();
        if (error) {
            alert(`No se pudo cerrar la sesión: ${error.message}`);
            return;
        }
        this.estado.usuario = null;
        this.estado.librosPDF = [];
        this.estado.librosComunidad = [];
        this.estado.grupoComunidad = null;
        this._actualizarCuentaSupabase();
        this.navegarA('biblioteca');
    },

    // ─────────────────────────────────────────────────────────
    //  VISTA: BIBLIOTECA
    // ─────────────────────────────────────────────────────────
    _renderBiblioteca() {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="page-enter">
                <div class="biblioteca-header">
                    <div>
                        <h1 class="biblioteca-header__title">Biblioteca Jurídica</h1>
                        <p class="biblioteca-header__subtitle">
                        </p>
                    </div>
                    <div class="biblioteca-search">
                        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input type="text" id="inp-buscar" class="search-input" placeholder="Buscar ley..." autocomplete="off">
                    </div>
                </div>

                <div class="stats-bar">
                    <div class="stat-item">
                        <span class="stat-num">${LEYES_DATA.length}</span>
                        <span class="stat-label">Leyes disponibles</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-num" id="stat-articulos">—</span>
                        <span class="stat-label">Artículos analizados</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-num" id="stat-quizzes">—</span>
                        <span class="stat-label">Quizzes generados</span>
                    </div>
                </div>

                <div class="leyes-grid" id="leyes-grid">
                    ${LEYES_DATA.map(l => this._htmlCard(l)).join('')}
                </div>
            </div>
        `;

        this._cargarStatsCache();
        this._attachCardEvents();

        document.getElementById('inp-buscar')?.addEventListener('input', (e) => {
            this._filtrarLeyes(e.target.value.toLowerCase());
        });
    },

    async _cargarLibrosPDF() {
        if (this.supabaseClient) {
            if (!this.estado.usuario) throw new Error('Inicia sesión para ver tus libros privados.');
            const table = this.supabaseConfig.table;
            const { data, error } = await this.supabaseClient
                .from(table)
                .select('id,nombre,storage_path,is_shared,created_at')
                .eq('user_id', this.estado.usuario.id)
                .order('created_at', { ascending: false });
            if (error) throw new Error(`No se pudieron cargar los libros: ${error.message}`);

            const books = await Promise.all(data.map(async book => {
                const { data: signed, error: signedError } = await this.supabaseClient
                    .storage
                    .from(this.supabaseConfig.bucket)
                    .createSignedUrl(book.storage_path, 86400);
                if (signedError) throw new Error(`No se pudo preparar “${book.nombre}” para abrirlo: ${signedError.message}`);
                return {
                    id: book.id,
                    filename: book.storage_path,
                    name: book.nombre,
                    url: signed.signedUrl,
                    is_shared: book.is_shared
                };
            }));
            this.estado.librosPDF = books;
            return books;
        }

        const response = await fetch('/api/books');
        const data = await this._leerRespuestaJSON(response, 'cargar los libros');
        if (!Array.isArray(data)) throw new Error('El servidor devolvió una lista de libros con formato no válido.');
        this.estado.librosPDF = data;
        return data;
    },

    async _leerRespuestaJSON(response, accion) {
        const texto = await response.text();
        let data;
        if (texto.trim()) {
            try {
                data = JSON.parse(texto);
            } catch (_) {
                const estado = `HTTP ${response.status}`;
                const hostingLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
                const indicacion = hostingLocal
                    ? 'Asegúrate de iniciar la aplicación con start.bat.'
                    : 'Configura Supabase en js/supabase-config.js y aplica supabase/setup.sql.';
                throw new Error(`No se pudo ${accion}: el servidor respondió con un formato inesperado (${estado}). ${indicacion}`);
            }
        } else {
            if (response.status === 405) {
                const hostingLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
                const indicacion = hostingLocal
                    ? 'Abre start.bat; la aplicación abrirá una dirección de puerto disponible.'
                    : 'Configura Supabase en js/supabase-config.js para importar desde la web publicada.';
                throw new Error(`El servidor que atiende esta página no admite la importación (HTTP 405). ${indicacion}`);
            }
            throw new Error(`No se pudo ${accion}: el servidor respondió vacío (HTTP ${response.status}). Cierra cualquier servidor anterior y vuelve a iniciar la aplicación con start.bat.`);
        }
        if (!response.ok) throw new Error(data.error || `No se pudo ${accion} (HTTP ${response.status}).`);
        return data;
    },

    async _importarLibroPDF(archivo) {
        if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
            alert('Selecciona un archivo PDF.');
            return;
        }
        const nombreSugerido = archivo.name.replace(/\.pdf$/i, '');
        const nombre = prompt('¿Con qué nombre quieres guardar este libro?', nombreSugerido);
        if (nombre === null) return;
        if (!nombre.trim()) {
            alert('Escribe un nombre para el libro.');
            return;
        }
        if (this.supabaseClient && archivo.size > 50 * 1024 * 1024) {
            alert('El PDF supera el límite actual de 50 MB del almacenamiento Supabase.');
            return;
        }

        const boton = document.getElementById('btn-importar-libro');
        if (boton) {
            boton.disabled = true;
            boton.dataset.textoOriginal = boton.textContent;
            boton.textContent = 'Importando...';
        }
        try {
            if (this.supabaseClient) {
                const user = this.estado.usuario;
                if (!user) {
                    this._mostrarAutenticacion('libros-pdf');
                    return;
                }
                const storagePath = `${user.id}/${crypto.randomUUID()}.pdf`;
                const { error: uploadError } = await this.supabaseClient
                    .storage
                    .from(this.supabaseConfig.bucket)
                    .upload(storagePath, archivo, { contentType: 'application/pdf', upsert: false });
                if (uploadError) throw new Error(`No se pudo subir el PDF: ${uploadError.message}`);

                const { data, error: insertError } = await this.supabaseClient
                    .from(this.supabaseConfig.table)
                    .insert({
                        user_id: user.id,
                        nombre: nombre.trim(),
                        storage_path: storagePath
                    })
                    .select('id,nombre,storage_path,is_shared')
                    .single();
                if (insertError) {
                    const { error: cleanupError } = await this.supabaseClient
                        .storage.from(this.supabaseConfig.bucket).remove([storagePath]);
                    const cleanupMessage = cleanupError ? ` No se pudo limpiar el archivo subido: ${cleanupError.message}` : '';
                    throw new Error(`No se pudo registrar el libro: ${insertError.message}.${cleanupMessage}`);
                }
                await this._cargarLibrosPDF();
                alert(`“${data.nombre}” se guardó en tu biblioteca privada de Supabase.`);
                this.navegarA('libros-pdf');
                return;
            }

            const response = await fetch(`/api/books?name=${encodeURIComponent(nombre.trim())}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/pdf' },
                body: archivo
            });
            const data = await this._leerRespuestaJSON(response, 'guardar el PDF');
            await this._cargarLibrosPDF();
            alert(`“${data.name}” se guardó en la carpeta LIBROS PDF.`);
            this.navegarA('libros-pdf');
        } catch (error) {
            alert(error.message || 'No se pudo importar el PDF. Comprueba que el servidor esté iniciado.');
        } finally {
            if (boton) {
                boton.disabled = false;
                boton.textContent = '📥 Importar PDF';
            }
        }
    },

    async _renderLibrosPDF() {
        if (this.supabaseClient && !this.estado.usuario) {
            this._mostrarAutenticacion('libros-pdf');
            return;
        }
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="page-enter libros-page">
                <div class="page-header">
                    <button class="btn btn--ghost" id="btn-back-libros">‹ Biblioteca</button>
                    <div>
                        <h1 class="page-title">LIBROS PDF</h1>
                        <p class="page-subtitle">Tus libros de lectura, guardados para abrirlos y generar preguntas.</p>
                    </div>
                    <button type="button" class="btn btn--gold" id="btn-importar-libro-page">📥 Importar PDF</button>
                </div>
                <div id="libros-pdf-lista" class="leyes-grid">
                    <p class="loading-inline"><span class="spinner-sm"></span> Cargando libros...</p>
                </div>
            </div>
        `;
        document.getElementById('btn-back-libros')?.addEventListener('click', () => this.navegarA('biblioteca'));
        document.getElementById('btn-importar-libro-page')?.addEventListener('click', () => {
            this._abrirSelectorImportacion();
        });
        try {
            const libros = await this._cargarLibrosPDF();
            const lista = document.getElementById('libros-pdf-lista');
            if (!lista) return;
            if (libros.length === 0) {
                lista.innerHTML = '<div class="libros-vacio">Aún no hay libros. Usa “Importar PDF” para agregar uno.</div>';
                return;
            }
            lista.innerHTML = libros.map(libro => `
                <article class="ley-card libro-card">
                    <div class="ley-card__header libro-card__header">
                        <span class="ley-card__icon">📘</span>
                        <span class="ley-card__badge">Libro de lectura</span>
                    </div>
                    <div class="ley-card__body">
                        <h2 class="ley-card__titulo">${this._escaparHTML(libro.name)}</h2>
                        <label class="libro-renombrar">
                            Nombre del libro
                            <input class="input-num" type="text" value="${this._escaparHTML(libro.name)}" maxlength="100" data-book-name>
                        </label>
                    </div>
                    <div class="ley-card__footer libro-card__footer">
                        <button class="btn btn--outline btn-libro-leer" data-book-file="${encodeURIComponent(libro.filename)}">Abrir</button>
                        <button class="btn btn--gold btn-libro-quiz" data-book-file="${encodeURIComponent(libro.filename)}">Generar preguntas</button>
                        <button class="btn btn--ghost btn-libro-renombrar" data-book-file="${encodeURIComponent(libro.filename)}">Guardar nombre</button>
                        <button class="btn btn--ghost btn-libro-eliminar" data-book-file="${encodeURIComponent(libro.filename)}">🗑️ Eliminar</button>
                    </div>
                </article>
            `).join('');
            lista.querySelectorAll('.btn-libro-leer').forEach(button => button.addEventListener('click', () => {
                this.navegarA('lector', { leyId: this._idLibro(decodeURIComponent(button.dataset.bookFile)) });
            }));
            lista.querySelectorAll('.btn-libro-quiz').forEach(button => button.addEventListener('click', () => {
                this.navegarA('quiz-config', { leyId: this._idLibro(decodeURIComponent(button.dataset.bookFile)) });
            }));
            lista.querySelectorAll('.btn-libro-renombrar').forEach(button => button.addEventListener('click', () => {
                const filename = decodeURIComponent(button.dataset.bookFile);
                const input = button.closest('.ley-card').querySelector('[data-book-name]');
                this._renombrarLibro(filename, input.value);
            }));
            lista.querySelectorAll('.btn-libro-eliminar').forEach(button => button.addEventListener('click', () => {
                const filename = decodeURIComponent(button.dataset.bookFile);
                const libro = libros.find(item => item.filename === filename);
                this._eliminarLibro(filename, libro?.name || filename);
            }));
        } catch (error) {
            const lista = document.getElementById('libros-pdf-lista');
            if (lista) lista.innerHTML = `<p class="config-error">No se pudieron cargar los libros: ${this._escaparHTML(error.message)}</p>`;
        }
    },

    async _renderComunidad(groupId = null) {
        const main = document.getElementById('main-content');
        if (!this.supabaseClient || !this.estado.usuario) {
            main.innerHTML = `
                <div class="page-enter">
                    <div class="page-header"><div><h1 class="page-title">COMUNIDAD</h1></div></div>
                    <div class="config-card"><p>La comunidad requiere una cuenta y conexión con Supabase.</p></div>
                </div>`;
            return;
        }

        if (groupId) {
            try {
                await this._renderDetalleComunidad(groupId);
            } catch (error) {
                main.innerHTML = `<div class="config-card"><p class="config-error">No se pudo abrir el grupo: ${this._escaparHTML(error.message)}</p><button class="btn btn--outline" id="btn-volver-comunidades">Volver a COMUNIDAD</button></div>`;
                document.getElementById('btn-volver-comunidades')?.addEventListener('click', () => this.navegarA('comunidad'));
            }
            return;
        }

        this.estado.grupoComunidad = null;
        const [{ data: grupos, error }, { data: membresias, error: membershipsError }] = await Promise.all([
            this.supabaseClient
            .from('community_groups')
            .select('id,name,description,is_public')
            .order('name'),
            this.supabaseClient
                .from('community_members')
                .select('group_id,role')
                .eq('user_id', this.estado.usuario.id)
        ]);
        if (error || membershipsError) {
            const loadError = error || membershipsError;
            main.innerHTML = `<div class="config-card"><h1 class="page-title">COMUNIDAD</h1><p class="config-error">No se pudieron cargar los grupos: ${this._escaparHTML(loadError.message)}. Ejecuta la configuración SQL actualizada de Supabase.</p></div>`;
            return;
        }
        const membresiasPorGrupo = new Map((membresias || []).map(membresia => [membresia.group_id, membresia.role]));
        const misGrupos = (grupos || []).filter(grupo => membresiasPorGrupo.has(grupo.id));
        const gruposPublicos = (grupos || []).filter(grupo => grupo.is_public && !membresiasPorGrupo.has(grupo.id));

        main.innerHTML = `
            <div class="page-enter libros-page">
                <div class="page-header">
                    <div>
                        <h1 class="page-title">COMUNIDAD</h1>
                        <p class="page-subtitle">Crea grupos públicos o privados. Los grupos públicos aparecen aquí; para unirte a cualquiera necesitarás su código.</p>
                    </div>
                </div>
                <div class="comunidad-acciones">
                    <form class="config-card comunidad-form" id="form-crear-comunidad">
                        <h2>Crear un grupo</h2>
                        <label class="libro-renombrar">Nombre del grupo
                            <input class="input-num" name="name" maxlength="80" required placeholder="Ej. Grupo de lectura">
                        </label>
                        <label class="libro-renombrar">Descripción
                            <textarea class="input-num" name="description" maxlength="500" required rows="3" placeholder="¿Qué estudiarán en este grupo?"></textarea>
                        </label>
                        <label class="libro-renombrar">Visibilidad
                            <select class="input-num" name="is_public" required>
                                <option value="false">Privado: solo visible para sus miembros</option>
                                <option value="true">Público: aparece en la lista de grupos</option>
                            </select>
                        </label>
                        <button class="btn btn--gold" type="submit">Crear grupo y obtener código</button>
                    </form>
                    <form class="config-card comunidad-form" id="form-unirse-comunidad">
                        <h2>Ingresar a un grupo</h2>
                        <label class="libro-renombrar">Código de ingreso
                            <input class="input-num" name="code" maxlength="20" minlength="8" required placeholder="Escribe el código">
                        </label>
                        <button class="btn btn--outline" type="submit">Ingresar al grupo</button>
                    </form>
                </div>
                <section class="comunidad-grupos">
                    <h2 class="opcion-label">Mis grupos</h2>
                    ${misGrupos.length ? `<div class="leyes-grid">${misGrupos.map(grupo => `
                        <article class="ley-card">
                            <div class="ley-card__header"><span class="ley-card__icon">👥</span><span class="ley-card__badge">${membresiasPorGrupo.get(grupo.id) === 'owner' ? 'Administrador' : 'Miembro'} · ${grupo.is_public ? 'Público' : 'Privado'}</span></div>
                            <div class="ley-card__body"><h2 class="ley-card__titulo">${this._escaparHTML(grupo.name)}</h2><p class="ley-card__desc">${this._escaparHTML(grupo.description)}</p></div>
                            <div class="ley-card__footer"><button class="btn btn--gold btn-abrir-comunidad" data-group-id="${grupo.id}">Abrir grupo</button></div>
                        </article>`).join('')}</div>` : '<div class="libros-vacio">Todavía no perteneces a ningún grupo. Crea uno o ingresa con un código.</div>'}
                </section>
                <section class="comunidad-grupos">
                    <h2 class="opcion-label">Grupos públicos</h2>
                    ${gruposPublicos.length ? `<div class="leyes-grid">${gruposPublicos.map(grupo => `
                        <article class="ley-card">
                            <div class="ley-card__header"><span class="ley-card__icon">🌐</span><span class="ley-card__badge">Público</span></div>
                            <div class="ley-card__body"><h2 class="ley-card__titulo">${this._escaparHTML(grupo.name)}</h2><p class="ley-card__desc">${this._escaparHTML(grupo.description)}</p></div>
                            <div class="ley-card__footer">
                                <form class="comunidad-unirse-publico" data-group-id="${grupo.id}" data-group-name="${this._escaparHTML(grupo.name)}">
                                    <label class="libro-renombrar">Código de ingreso
                                        <input class="input-num" name="code" maxlength="20" minlength="8" required placeholder="Escribe el código">
                                    </label>
                                    <button class="btn btn--gold" type="submit">Unirme al grupo</button>
                                </form>
                            </div>
                        </article>`).join('')}</div>` : '<div class="libros-vacio">Todavía no hay grupos públicos disponibles.</div>'}
                </section>
            </div>`;

        document.querySelectorAll('.btn-abrir-comunidad').forEach(button => {
            button.addEventListener('click', () => this.navegarA('comunidad', { groupId: button.dataset.groupId }));
        });
        document.getElementById('form-crear-comunidad')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                const random = crypto.getRandomValues(new Uint8Array(12));
                const code = [...random].map(value => chars[value % chars.length]).join('');
                const fields = new FormData(form);
                const { data: id, error: createError } = await this.supabaseClient.rpc('create_community_group', {
                    p_name: fields.get('name'),
                    p_description: fields.get('description'),
                    p_is_public: fields.get('is_public') === 'true',
                    p_join_code: code
                });
                if (createError) throw new Error(`No se pudo crear el grupo: ${createError.message}`);
                alert(`Grupo creado. Guarda y comparte este código de ingreso: ${code}`);
                this.navegarA('comunidad', { groupId: id });
            } catch (error) {
                alert(error.message || 'No se pudo crear el grupo.');
                submit.disabled = false;
            }
        });
        document.getElementById('form-unirse-comunidad')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const code = String(new FormData(form).get('code') || '').trim().toUpperCase();
                const { data: id, error: joinError } = await this.supabaseClient.rpc('join_community_group', { p_join_code: code });
                if (joinError) throw new Error(`No se pudo ingresar al grupo: ${joinError.message}`);
                this.navegarA('comunidad', { groupId: id });
            } catch (error) {
                alert(error.message || 'No se pudo ingresar al grupo.');
                submit.disabled = false;
            }
        });
        document.querySelectorAll('.comunidad-unirse-publico').forEach(form => form.addEventListener('submit', async event => {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const code = String(new FormData(form).get('code') || '').trim().toUpperCase();
                const { data: id, error: joinError } = await this.supabaseClient.rpc('join_community_group', {
                    p_join_code: code,
                    p_group_id: form.dataset.groupId
                });
                if (joinError) throw new Error(joinError.message);
                this.navegarA('comunidad', { groupId: id });
            } catch (joinError) {
                alert(`No se pudo ingresar a ${form.dataset.groupName}: ${joinError.message}`);
                submit.disabled = false;
            }
        }));
    },

    async _renderDetalleComunidad(groupId) {
        const main = document.getElementById('main-content');
        const { data: grupo, error: groupError } = await this.supabaseClient
            .from('community_groups')
            .select('id,name,description,is_public')
            .eq('id', groupId)
            .maybeSingle();
        if (groupError || !grupo) {
            main.innerHTML = `<div class="config-card"><p class="config-error">No se pudo abrir este grupo. Puede que ya no seas miembro${groupError ? `: ${this._escaparHTML(groupError.message)}` : '.'}</p><button class="btn btn--outline" id="btn-volver-comunidades">Volver a COMUNIDAD</button></div>`;
            document.getElementById('btn-volver-comunidades')?.addEventListener('click', () => this.navegarA('comunidad'));
            return;
        }
        const { data: membership, error: membershipError } = await this.supabaseClient
            .from('community_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', this.estado.usuario.id)
            .maybeSingle();
        if (membershipError || !membership) {
            const message = membershipError
                ? `No se pudo comprobar tu acceso al grupo: ${membershipError.message}`
                : 'Solo los miembros pueden ver los archivos. Vuelve a COMUNIDAD e ingresa con el código del grupo.';
            main.innerHTML = `<div class="config-card"><p class="config-error">${this._escaparHTML(message)}</p><button class="btn btn--outline" id="btn-volver-comunidades">Volver a COMUNIDAD</button></div>`;
            document.getElementById('btn-volver-comunidades')?.addEventListener('click', () => this.navegarA('comunidad'));
            return;
        }
        this.estado.grupoComunidad = grupo;
        const { data: libros, error: booksError } = await this.supabaseClient
            .from('community_books')
            .select('id,group_id,user_id,name,storage_path,created_at')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });
        if (booksError) {
            main.innerHTML = `<div class="config-card"><p class="config-error">No se pudieron cargar los PDFs del grupo: ${this._escaparHTML(booksError.message)}</p><button class="btn btn--outline" id="btn-volver-comunidades">Volver a COMUNIDAD</button></div>`;
            document.getElementById('btn-volver-comunidades')?.addEventListener('click', () => this.navegarA('comunidad'));
            return;
        }
        const librosPreparados = await Promise.all(libros.map(async libro => {
            const { data, error } = await this.supabaseClient.storage
                .from('comunidad-pdf')
                .createSignedUrl(libro.storage_path, 86400);
            if (error) throw new Error(`No se pudo preparar “${libro.name}” para abrirlo: ${error.message}`);
            return { ...libro, url: data.signedUrl };
        }));
        this.estado.librosComunidad = librosPreparados;

        let codigoInvitacion = '';
        if (membership.role === 'owner') {
            const { data: invite, error: inviteError } = await this.supabaseClient
                .from('community_invites')
                .select('join_code')
                .eq('group_id', groupId)
                .maybeSingle();
            if (inviteError) throw new Error(`No se pudo cargar el código del grupo: ${inviteError.message}`);
            codigoInvitacion = invite?.join_code || '';
        }

        main.innerHTML = `
            <div class="page-enter libros-page">
                <div class="page-header">
                    <button class="btn btn--ghost" id="btn-volver-comunidades">‹ COMUNIDAD</button>
                    <div><h1 class="page-title">${this._escaparHTML(grupo.name)}</h1><p class="page-subtitle">${this._escaparHTML(grupo.description)} · Grupo ${grupo.is_public ? 'público' : 'privado'}; los PDFs son solo para sus miembros.</p></div>
                    <button type="button" class="btn btn--gold" id="btn-subir-pdf-comunidad">📥 Subir PDF</button>
                    <input type="file" id="input-pdf-comunidad" accept="application/pdf,.pdf" hidden>
                </div>
                ${codigoInvitacion ? `<div class="comunidad-codigo"><span>Código para invitar miembros:</span><strong>${this._escaparHTML(codigoInvitacion)}</strong><button type="button" class="btn btn--outline" id="btn-copiar-codigo">Copiar código</button></div>` : ''}
                <div id="lista-pdfs-comunidad" class="leyes-grid">
                    ${librosPreparados.length ? librosPreparados.map(libro => `
                        <article class="ley-card libro-card">
                            <div class="ley-card__header libro-card__header"><span class="ley-card__icon">📘</span><span class="ley-card__badge">PDF compartido</span></div>
                            <div class="ley-card__body"><h2 class="ley-card__titulo">${this._escaparHTML(libro.name)}</h2><p class="ley-card__desc">Subido por un miembro del grupo</p></div>
                            <div class="ley-card__footer libro-card__footer">
                                <button class="btn btn--outline btn-comunidad-leer" data-book-id="${libro.id}">Abrir</button>
                                <button class="btn btn--gold btn-comunidad-quiz" data-book-id="${libro.id}">Generar preguntas</button>
                                ${libro.user_id === this.estado.usuario.id ? `<button class="btn btn--ghost btn-comunidad-eliminar" data-book-id="${libro.id}">🗑️ Eliminar</button>` : ''}
                            </div>
                        </article>`).join('') : '<div class="libros-vacio">Este grupo aún no tiene PDFs. Sube uno para compartirlo con sus miembros.</div>'}
                </div>
            </div>`;

        document.getElementById('btn-volver-comunidades')?.addEventListener('click', () => this.navegarA('comunidad'));
        document.getElementById('btn-subir-pdf-comunidad')?.addEventListener('click', () => document.getElementById('input-pdf-comunidad')?.click());
        document.getElementById('input-pdf-comunidad')?.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) await this._subirPDFComunidad(file, grupo);
        });
        document.getElementById('btn-copiar-codigo')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(codigoInvitacion);
                alert('Código copiado.');
            } catch (error) {
                alert(`No se pudo copiar el código automáticamente: ${error.message}. Cópialo manualmente.`);
            }
        });
        document.querySelectorAll('.btn-comunidad-leer').forEach(button => button.addEventListener('click', () => {
            this.navegarA('lector', { leyId: this._idLibroComunidad(button.dataset.bookId) });
        }));
        document.querySelectorAll('.btn-comunidad-quiz').forEach(button => button.addEventListener('click', () => {
            this.navegarA('quiz-config', { leyId: this._idLibroComunidad(button.dataset.bookId) });
        }));
        document.querySelectorAll('.btn-comunidad-eliminar').forEach(button => button.addEventListener('click', async () => {
            const libro = this.estado.librosComunidad.find(item => item.id === button.dataset.bookId);
            if (libro) await this._eliminarPDFComunidad(libro, grupo);
        }));
    },

    async _subirPDFComunidad(archivo, grupo) {
        if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
            alert('Selecciona un archivo PDF.');
            return;
        }
        if (archivo.size > 50 * 1024 * 1024) {
            alert('El PDF supera el límite actual de 50 MB de Supabase Storage.');
            return;
        }
        const nombreSugerido = archivo.name.replace(/\.pdf$/i, '');
        const nombre = prompt('¿Con qué nombre quieres compartir este libro?', nombreSugerido);
        if (nombre === null) return;
        if (!nombre.trim() || nombre.trim().length > 100) {
            alert('El nombre debe tener entre 1 y 100 caracteres.');
            return;
        }
        const storagePath = `community/${grupo.id}/${this.estado.usuario.id}/${crypto.randomUUID()}.pdf`;
        try {
            const { error: uploadError } = await this.supabaseClient.storage
                .from('comunidad-pdf')
                .upload(storagePath, archivo, { contentType: 'application/pdf', upsert: false });
            if (uploadError) throw new Error(`No se pudo subir el PDF: ${uploadError.message}`);
            const { error: insertError } = await this.supabaseClient.from('community_books').insert({
                group_id: grupo.id,
                user_id: this.estado.usuario.id,
                name: nombre.trim(),
                storage_path: storagePath
            });
            if (insertError) {
                const { error: cleanupError } = await this.supabaseClient.storage.from('comunidad-pdf').remove([storagePath]);
                throw new Error(`No se pudo registrar el PDF en el grupo: ${insertError.message}${cleanupError ? ` Además, no se pudo limpiar el archivo subido: ${cleanupError.message}` : ''}`);
            }
            await this._renderDetalleComunidad(grupo.id);
        } catch (error) {
            alert(error.message || 'No se pudo compartir el PDF.');
        }
    },

    async _eliminarPDFComunidad(libro, grupo) {
        if (!confirm(`¿Eliminar “${libro.name}” del grupo? Los demás miembros ya no podrán abrirlo.`)) return;
        try {
            const { error: storageError } = await this.supabaseClient.storage
                .from('comunidad-pdf')
                .remove([libro.storage_path]);
            if (storageError) throw new Error(`No se pudo eliminar el archivo: ${storageError.message}`);
            const { error } = await this.supabaseClient.from('community_books')
                .delete().eq('id', libro.id).eq('user_id', this.estado.usuario.id);
            if (error) throw new Error(`No se pudo eliminar el registro del PDF: ${error.message}`);
            await this._renderDetalleComunidad(grupo.id);
        } catch (error) {
            alert(error.message || 'No se pudo eliminar el PDF.');
        }
    },

    async _renombrarLibro(filename, name) {
        if (!name.trim()) {
            alert('Escribe un nombre para el libro.');
            return;
        }
        try {
            if (this.supabaseClient) {
                const libro = this.estado.librosPDF.find(item => item.filename === filename);
                if (!libro) throw new Error('No se encontró el libro en tu biblioteca.');
                const { error } = await this.supabaseClient
                    .from(this.supabaseConfig.table)
                    .update({ nombre: name.trim() })
                    .eq('id', libro.id)
                    .eq('user_id', this.estado.usuario.id);
                if (error) throw new Error(`No se pudo cambiar el nombre: ${error.message}`);
                await this._renderLibrosPDF();
                return;
            }

            const response = await fetch(`/api/books/${encodeURIComponent(filename)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() })
            });
            const data = await this._leerRespuestaJSON(response, 'cambiar el nombre del libro');
            await this._cargarLibrosPDF();
            this._renderLibrosPDF();
        } catch (error) {
            alert(error.message || 'No se pudo cambiar el nombre del libro.');
        }
    },

    async _eliminarLibro(filename, name) {
        const destino = this.supabaseClient ? 'tu biblioteca privada de Supabase' : 'la carpeta LIBROS PDF';
        if (!confirm(`¿Eliminar “${name}”? Esta acción borrará permanentemente el PDF de ${destino}.`)) return;
        try {
            if (this.supabaseClient) {
                const libro = this.estado.librosPDF.find(item => item.filename === filename);
                if (!libro) throw new Error('No se encontró el libro en tu biblioteca.');
                const { error: rowError } = await this.supabaseClient
                    .from(this.supabaseConfig.table)
                    .delete()
                    .eq('id', libro.id)
                    .eq('user_id', this.estado.usuario.id);
                if (rowError) throw new Error(`No se pudo eliminar el registro del libro: ${rowError.message}`);
                this.estado.librosPDF = this.estado.librosPDF.filter(item => item.id !== libro.id);
                const { error: fileError } = await this.supabaseClient
                    .storage
                    .from(this.supabaseConfig.bucket)
                    .remove([filename]);
                if (fileError) {
                    throw new Error(`El libro se quitó de tu lista, pero no se pudo borrar el archivo almacenado: ${fileError.message}`);
                }
                await this._renderLibrosPDF();
                return;
            }

            const response = await fetch(`/api/books/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            await this._leerRespuestaJSON(response, 'eliminar el libro');
            this.estado.librosPDF = this.estado.librosPDF.filter(libro => libro.filename !== filename);
            await this._renderLibrosPDF();
        } catch (error) {
            alert(error.message || 'No se pudo eliminar el libro.');
        }
    },

    _idLibro(filename) {
        return `libro:${encodeURIComponent(filename)}`;
    },

    _idLibroComunidad(id) {
        return `community-book:${id}`;
    },

    _obtenerDocumento(id) {
        const ley = LEYES_DATA.find(item => item.id === id);
        if (ley) return ley;
        if (id?.startsWith('community-book:')) {
            const libro = this.estado.librosComunidad.find(item => item.id === id.slice('community-book:'.length));
            if (!libro) return null;
            return {
                id,
                titulo: libro.name,
                subtitulo: 'PDF de comunidad',
                archivo: libro.url,
                icono: '📘',
                esLibro: true,
                esLibroComunidad: true,
                grupoId: libro.group_id
            };
        }
        if (!id?.startsWith('libro:')) return null;
        const filename = decodeURIComponent(id.slice('libro:'.length));
        const libro = this.estado.librosPDF.find(item => item.filename === filename);
        if (!libro) return null;
        return {
            id,
            titulo: libro.name,
            subtitulo: 'Libro de lectura',
            archivo: libro.url,
            icono: '📘',
            esLibro: true
        };
    },

    _htmlCard(ley) {
        return `
        <article class="ley-card" data-ley-id="${ley.id}" id="card-${ley.id}">
            <div class="ley-card__header" style="background: ${ley.colorGradient}">
                <span class="ley-card__icon">${ley.icono}</span>
                <div class="ley-card__badge">${ley.subtitulo}</div>
            </div>
            <div class="ley-card__body">
                <h3 class="ley-card__titulo">${ley.titulo}</h3>
                <p class="ley-card__desc">${ley.descripcion}</p>
                <div class="ley-card__tags">
                    ${ley.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('')}
                </div>
            </div>
            <div class="ley-card__footer">
                <button class="btn btn--outline btn-leer" data-ley-id="${ley.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    Leer
                </button>
                <button class="btn btn--gold btn-quiz" data-ley-id="${ley.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
                    </svg>
                    Quiz
                </button>
            </div>
        </article>`;
    },

    _attachCardEvents() {
        document.querySelectorAll('.btn-leer').forEach(btn => {
            btn.addEventListener('click', () => this.navegarA('lector', { leyId: btn.dataset.leyId }));
        });
        document.querySelectorAll('.btn-quiz').forEach(btn => {
            btn.addEventListener('click', () => this.navegarA('quiz-config', { leyId: btn.dataset.leyId }));
        });
    },

    _filtrarLeyes(q) {
        document.querySelectorAll('.ley-card').forEach(card => {
            const leyId = card.dataset.leyId;
            const ley = LEYES_DATA.find(l => l.id === leyId);
            const texto = (ley.titulo + ' ' + ley.subtitulo + ' ' + ley.tags.join(' ')).toLowerCase();
            card.style.display = texto.includes(q) ? '' : 'none';
        });
    },

    _cargarStatsCache() {
        let totalArticulos = 0;
        let totalQuizzes = parseInt(localStorage.getItem('bibliolex_quizzes_count') || '0');

        LEYES_DATA.forEach(ley => {
            const clave = 'bibliolex_v4_' + ley.archivo.replace(/[^a-z0-9]/gi, '_');
            try {
                const cached = localStorage.getItem(clave);
                if (cached) {
                    const data = JSON.parse(cached);
                    totalArticulos += data.articulos?.length || 0;
                }
            } catch (_) {}
        });

        if (totalArticulos > 0) {
            document.getElementById('stat-articulos').textContent = totalArticulos.toLocaleString();
        }
        document.getElementById('stat-quizzes').textContent = totalQuizzes > 0 ? totalQuizzes : '0';
    },

    // ─────────────────────────────────────────────────────────
    //  VISTA: LECTOR DE PDF
    // ─────────────────────────────────────────────────────────
    _renderLector(leyId) {
        const ley = this._obtenerDocumento(leyId);
        if (!ley) { this.navegarA('biblioteca'); return; }

        this.estado.leyActualId = leyId;
        const main = document.getElementById('main-content');

        main.innerHTML = `
            <div class="lector-wrap page-enter ${ley.esLibro ? 'lector-wrap--solo-pdf' : ''}">
                <div class="lector-topbar">
                    <button class="btn btn--ghost btn-back" id="btn-back-lector">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Biblioteca
                    </button>
                    <div class="lector-topbar__title">
                        <span class="lector-topbar__icon">${ley.icono}</span>
                        <span>${this._escaparHTML(ley.titulo)}</span>
                    </div>
                    <button class="btn btn--gold" id="btn-quiz-desde-lector" data-ley-id="${leyId}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
                        </svg>
                        Generar Quiz
                    </button>
                </div>

                <div class="lector-body">
                    ${ley.esLibro ? '' : `<aside class="lector-sidebar" id="lector-sidebar">
                        <div class="lector-sidebar__header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                            </svg>
                            Estructura
                        </div>
                        <div class="lector-sidebar__content" id="sidebar-estructura">
                            <div class="loading-inline">
                                <div class="spinner-sm"></div>
                                <span>Analizando estructura...</span>
                            </div>
                        </div>
                    </aside>`}

                    <div class="lector-pdf-wrap">
                        <object
                            id="pdf-iframe"
                            class="pdf-iframe"
                            data="${ley.archivo}#view=FitV"
                            type="application/pdf"
                            title="${this._escaparHTML(ley.titulo)}"
                        >
                            <div style="padding: 20px; text-align: center;">
                                <p style="margin-bottom: 10px;">Tu celular requiere abrir el PDF en una pestaña nueva para verlo completo.</p>
                                <a href="${ley.archivo}" target="_blank" rel="noopener" class="btn btn--gold">Abrir PDF Completo</a>
                            </div>
                        </object>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-back-lector')?.addEventListener('click', () => {
            if (ley.esLibroComunidad) this.navegarA('comunidad', { groupId: ley.grupoId });
            else this.navegarA('biblioteca');
        });
        document.getElementById('btn-quiz-desde-lector')?.addEventListener('click', () => {
            this.navegarA('quiz-config', { leyId });
        });

        if (!ley.esLibro) this._cargarEstructuraSidebar(ley);
    },

    async _cargarEstructuraSidebar(ley) {
        try {
            const estructura = await this.parser.cargarYParsear(ley.archivo);
            this.estado.estructura = estructura;
            this.estado.leyActualId = ley.id;
            this._renderSidebarEstructura(estructura);
        } catch (e) {
            const sidebar = document.getElementById('sidebar-estructura');
            if (sidebar) {
                sidebar.innerHTML = `<div class="error-inline">
                    <p>No se pudo analizar la estructura.</p>
                    <small>${e.message}</small>
                </div>`;
            }
        }
    },

    _renderSidebarEstructura(est) {
        const sidebar = document.getElementById('sidebar-estructura');
        if (!sidebar) return;

        if (this._obtenerDocumento(this.estado.leyActualId)?.esLibro) {
            const total = est.fragmentos?.length || 0;
            const titulos = est.titulosLectura || [];
            sidebar.innerHTML = total
                ? `<div class="tree-flat">
                    <div class="tree-flat-header"><span class="tree-flat-count">${total} fragmentos de lectura</span></div>
                    <p class="tree-flat-range">Se analizaron ideas y encabezados para crear preguntas basadas en el texto.</p>
                    ${titulos.length ? `<details class="book-headings">
                        <summary>Encabezados detectados (${titulos.length})</summary>
                        <ul>${titulos.slice(0, 40).map(titulo => `<li>${this._escaparHTML(titulo)}</li>`).join('')}</ul>
                        ${titulos.length > 40 ? `<small>Se muestran 40 de ${titulos.length} encabezados.</small>` : ''}
                    </details>` : '<p class="tree-flat-range">No se detectaron encabezados; las preguntas usarán ideas y fragmentos.</p>'}
                </div>`
                : '<p class="no-structure">No se pudo extraer texto del PDF. Puede ser un documento escaneado.</p>';
            return;
        }

        // Fallbacks for old cached structures
        est.partes = est.partes || [];
        est.libros = est.libros || [];
        est.titulos = est.titulos || [];
        est.capitulos = est.capitulos || [];
        est.secciones = est.secciones || [];
        est.articulos = est.articulos || [];

        let html = '';

        // Helper para renderizar un grupo colapsable
        const renderGroup = (tipo, label, itemsHTML, count, defaultOpen = false) => {
            if (!itemsHTML) return '';
            const colorClass = 'tree-summary--' + tipo;
            return '<details class="tree-details" ' + (defaultOpen ? 'open' : '') + '>' +
                '<summary class="tree-summary ' + colorClass + '">' +
                '<svg class="tree-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="m9 18 6-6-6-6"/></svg>' +
                '<span class="tree-label">' + label + '</span>' +
                '<span class="tree-badge">' + count + '</span>' +
                '</summary>' +
                '<div class="tree-children">' + itemsHTML + '</div>' +
                '</details>';
        };

        const renderArticulos = (arts) => {
            return arts.map(a => this._htmlTreeArticulo(a)).join('');
        };

        const renderSecciones = (seccs, todosArts) => {
            let out = '';
            const artsSinSecc = todosArts.filter(a => !a.seccion);
            out += renderArticulos(artsSinSecc);

            seccs.forEach(secc => {
                const artsEnSecc = todosArts.filter(a => a.seccion === secc.linea);
                if (artsEnSecc.length > 0) {
                    out += renderGroup('seccion', secc.linea, renderArticulos(artsEnSecc), artsEnSecc.length);
                }
            });
            return out;
        };

        const renderCapitulos = (caps, todosSeccs, todosArts) => {
            let out = '';
            // Artículos sin capítulo en este nivel
            const artsSinCap = todosArts.filter(a => !a.capitulo);
            out += renderSecciones(todosSeccs.filter(s => !s.capitulo), artsSinCap);

            caps.forEach(cap => {
                const seccsEnCap = todosSeccs.filter(s => s.capitulo === cap.linea);
                const artsEnCap = todosArts.filter(a => a.capitulo === cap.linea);
                if (artsEnCap.length > 0) {
                    const contenido = renderSecciones(seccsEnCap, artsEnCap);
                    out += renderGroup('cap', cap.linea, contenido, artsEnCap.length);
                }
            });
            return out;
        };

        const renderTitulos = (tits, todosCaps, todosSeccs, todosArts) => {
            let out = '';
            // Artículos sin título en este nivel
            const artsSinTit = todosArts.filter(a => !a.titulo);
            out += renderCapitulos(todosCaps.filter(c => !c.titulo), todosSeccs.filter(s => !s.titulo), artsSinTit);

            tits.forEach(tit => {
                const capsEnTit = todosCaps.filter(c => c.titulo === tit.linea);
                const seccsEnTit = todosSeccs.filter(s => s.titulo === tit.linea);
                const artsEnTit = todosArts.filter(a => a.titulo === tit.linea);
                if (artsEnTit.length > 0) {
                    const contenido = renderCapitulos(capsEnTit, seccsEnTit, artsEnTit);
                    out += renderGroup('titulo', tit.linea, contenido, artsEnTit.length);
                }
            });
            return out;
        };

        const renderLibros = (libs, todosTits, todosCaps, todosSeccs, todosArts) => {
            let out = '';
            const artsSinLib = todosArts.filter(a => !a.libro);
            out += renderTitulos(todosTits.filter(t => !t.libro), todosCaps.filter(c => !c.libro), todosSeccs.filter(s => !s.libro), artsSinLib);

            libs.forEach(lib => {
                const titsEnLib = todosTits.filter(t => t.libro === lib.linea);
                const capsEnLib = todosCaps.filter(c => c.libro === lib.linea);
                const seccsEnLib = todosSeccs.filter(s => s.libro === lib.linea);
                const artsEnLib = todosArts.filter(a => a.libro === lib.linea);
                if (artsEnLib.length > 0) {
                    const contenido = renderTitulos(titsEnLib, capsEnLib, seccsEnLib, artsEnLib);
                    out += renderGroup('libro', lib.linea, contenido, artsEnLib.length);
                }
            });
            return out;
        };

        // Jerarquía principal: Partes -> Libros -> Títulos -> Capítulos -> Secciones -> Artículos
        if (est.partes.length > 0) {
            let out = '';
            const artsSinParte = est.articulos.filter(a => !a.parte);
            out += renderLibros(
                est.libros.filter(l => !l.parte),
                est.titulos.filter(t => !t.parte),
                est.capitulos.filter(c => !c.parte),
                est.secciones.filter(s => !s.parte),
                artsSinParte
            );

            est.partes.forEach(parte => {
                const libsEnParte = est.libros.filter(l => l.parte === parte.linea);
                const titsEnParte = est.titulos.filter(t => t.parte === parte.linea);
                const capsEnParte = est.capitulos.filter(c => c.parte === parte.linea);
                const seccsEnParte = est.secciones.filter(s => s.parte === parte.linea);
                const artsEnParte = est.articulos.filter(a => a.parte === parte.linea);
                if (artsEnParte.length > 0) {
                    const contenido = renderLibros(libsEnParte, titsEnParte, capsEnParte, seccsEnParte, artsEnParte);
                    out += renderGroup('parte', parte.linea, contenido, artsEnParte.length);
                }
            });
            html = out;
        } else if (est.libros && est.libros.length > 0) {
            html = renderLibros(est.libros, est.titulos, est.capitulos, est.secciones, est.articulos);
        } else if (est.titulos.length > 0) {
            html = renderTitulos(est.titulos, est.capitulos, est.secciones, est.articulos);
        } else if (est.capitulos.length > 0) {
            html = renderCapitulos(est.capitulos, est.secciones, est.articulos);
        } else if (est.secciones && est.secciones.length > 0) {
            html = renderSecciones(est.secciones, est.articulos);
        } else if (est.articulos.length > 0) {
            html = renderArticulos(est.articulos);
        }

        if (html) {
            // Envolver la lista plana si no hay grupos
            if (!html.includes('<details')) {
                const min = est.articulos[0].numero;
                const max = est.articulos[est.articulos.length - 1].numero;
                html = '<div class="tree-flat-header">' +
                    '<span class="tree-flat-count">' + est.articulos.length + ' artículos</span>' +
                    '<span class="tree-flat-range">Arts. ' + min + '\u2013' + max + '</span>' +
                    '</div><div class="tree-flat">' + html + '</div>';
            }
        } else {
            html = '<p class="no-structure">No se detectó estructura en este documento.</p>';
        }

        sidebar.innerHTML = html;
    },

    _htmlTreeArticulo(art) {
        const numDisplay = art.variante ? (art.numero + ' ' + art.variante) : art.numero;

        // Extraer solo el texto entre paréntesis al inicio del artículo, si existe
        // Ej: "(Objeto)", "(Principio de legalidad)", etc.
        let etiqueta = '';
        if (art.contenido) {
            const m = art.contenido.trim().match(/^\(([^)]{1,70})\)/);
            if (m) etiqueta = '(' + m[1] + ')';
        }

        const key = art.numero + (art.variante ? '-' + art.variante : '');
        const favsLey = this.estado.favoritos[this.estado.leyActualId] || [];
        const isFav = favsLey.includes(key);
        const star = isFav ? '⭐' : '☆';

        return '<div class="tree-articulo">' +
            '<span class="tree-art-num">Art. ' + numDisplay +
            (etiqueta ? ' <span class=\'tree-art-etiqueta\'>' + etiqueta + '</span>' : '') +
            '</span>' +
            '<button class="btn-fav ' + (isFav ? 'is-fav' : '') + '" onclick="App.toggleFavorito(\'' + this.estado.leyActualId + '\', ' + art.numero + ', \'' + (art.variante || '') + '\'); this.textContent = this.textContent === \'⭐\' ? \'☆\' : \'⭐\'; this.classList.toggle(\'is-fav\');" title="Añadir a Favoritos">' + star + '</button>' +
            '</div>';
    },


    // ─────────────────────────────────────────────────────────
    //  VISTA: CONFIGURACIÓN DEL QUIZ
    // ─────────────────────────────────────────────────────────
    _renderQuizConfig(leyId = null) {
        const documento = this._obtenerDocumento(leyId || this.estado.leyActualId);
        if (documento?.esLibro) {
            this._renderQuizConfigLibro(documento);
            return;
        }
        const main = document.getElementById('main-content');

        const leySelId = leyId || this.estado.leyActualId;
        const leySelIdx = leySelId ? LEYES_DATA.findIndex(l => l.id === leySelId) : 0;

        main.innerHTML = `
            <div class="quiz-config-wrap page-enter">
                <div class="page-header">
                    <button class="btn btn--ghost" id="btn-back-config">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Biblioteca
                    </button>
                    <div>
                        <h1 class="page-title">Generar Quiz</h1>
                        <p class="page-subtitle">Configura tu sesión de estudio</p>
                    </div>
                </div>

                <div class="quiz-config-grid">
                    <!-- PASO 1: Elegir ley -->
                    <section class="config-card" id="config-paso1">
                        <div class="config-card__header">
                            <span class="config-step">1</span>
                            <h2>Seleccionar Ley</h2>
                        </div>
                        <div class="ley-selector" id="ley-selector">
                            ${LEYES_DATA.map((l, i) => `
                            <label class="ley-option ${i === leySelIdx ? 'ley-option--selected' : ''}" data-ley-id="${l.id}">
                                <input type="radio" name="ley-radio" value="${l.id}" ${i === leySelIdx ? 'checked' : ''} style="display:none">
                                <span class="ley-option__icon">${l.icono}</span>
                                <div class="ley-option__info">
                                    <div class="ley-option__nombre">${l.titulo}</div>
                                    <div class="ley-option__sub">${l.subtitulo}</div>
                                </div>
                                <div class="ley-option__check">✓</div>
                            </label>`).join('')}
                        </div>
                    </section>

                    <div class="config-right">
                        <!-- PASO 2: Rango -->
                        <section class="config-card">
                            <div class="config-card__header">
                                <span class="config-step">2</span>
                                <h2>Rango a Estudiar</h2>
                            </div>

                            <div class="rango-tipo-tabs">
                                <button class="rango-tab active" data-rango="articulos">Por Artículo</button>
                                <button class="rango-tab" data-rango="titulo">Por Título</button>
                                <button class="rango-tab" data-rango="capitulo">Por Capítulo</button>
                                <button class="rango-tab" data-rango="parte">Por Parte</button>
                            </div>

                            <div id="rango-panel" class="rango-panel">
                                ${this._htmlRangoArticulos()}
                            </div>

                            <div id="rango-info" class="rango-info" style="display:none">
                                <div class="rango-info__inner">
                                    <div class="spinner-sm"></div>
                                    <span id="rango-info-text">Analizando PDF...</span>
                                </div>
                            </div>
                        </section>

                        <!-- PASO 3: Opciones -->
                        <section class="config-card">
                            <div class="config-card__header">
                                <span class="config-step">3</span>
                                <h2>Opciones del Quiz</h2>
                            </div>

                            <div class="opciones-grid">
                                <div class="opcion-grupo">
                                    <label class="opcion-label">Número de preguntas</label>
                                    <div class="cantidad-btns">
                                        <button class="cant-btn" data-cant="5">5</button>
                                        <button class="cant-btn cant-btn--active" data-cant="10">10</button>
                                        <button class="cant-btn" data-cant="15">15</button>
                                        <button class="cant-btn" data-cant="20">20</button>
                                    </div>
                                </div>

                                <div class="opcion-grupo">
                                    <label class="opcion-label">Tipos de pregunta</label>
                                    <div class="tipos-checks">
                                        <label class="tipo-check">
                                            <input type="checkbox" name="tipo-pregunta" value="opcion-multiple" checked>
                                            <span class="tipo-check__box" style="--color:#3b82f6"></span>
                                            <span>Opción Múltiple</span>
                                        </label>
                                        <label class="tipo-check">
                                            <input type="checkbox" name="tipo-pregunta" value="identificar" checked>
                                            <span class="tipo-check__box" style="--color:#8b5cf6"></span>
                                            <span>Identificar Artículo</span>
                                        </label>
                                        <label class="tipo-check">
                                            <input type="checkbox" name="tipo-pregunta" value="verdadero-falso" checked>
                                            <span class="tipo-check__box" style="--color:#f59e0b"></span>
                                            <span>Verdadero o Falso</span>
                                        </label>
                                        <label class="tipo-check">
                                            <input type="checkbox" name="tipo-pregunta" value="completar">
                                            <span class="tipo-check__box" style="--color:#22c55e"></span>
                                            <span>Completar Texto</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- Botón Iniciar -->
                        <button class="btn btn--gold btn--lg btn--full" id="btn-iniciar-quiz">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Iniciar Quiz
                        </button>
                        <div id="config-error" class="config-error" style="display:none"></div>
                    </div>
                </div>
            </div>
        `;

        this._attachConfigEvents(leySelId || LEYES_DATA[0].id);
        document.getElementById('btn-back-config')?.addEventListener('click', () => this.navegarA('biblioteca'));

        // Si viene con ley preseleccionada, pre-cargar estructura
        if (leySelId) {
            this._preCargarEstructura(leySelId);
        }
    },

    _renderQuizConfigLibro(libro) {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="quiz-config-wrap page-enter">
                <div class="page-header">
                    <button class="btn btn--ghost" id="btn-back-config">‹ LIBROS PDF</button>
                    <div>
                        <h1 class="page-title">Preguntas de lectura</h1>
                        <p class="page-subtitle">${this._escaparHTML(libro.titulo)}</p>
                    </div>
                </div>
                <div class="config-card libro-quiz-config">
                    <div class="config-card__header"><span class="config-step">1</span><h2>Configura tus preguntas</h2></div>
                    <div class="opcion-grupo">
                        <label class="opcion-label">Número de preguntas</label>
                        <div class="cantidad-btns">
                            <button class="cant-btn" data-cant="5">5</button>
                            <button class="cant-btn cant-btn--active" data-cant="10">10</button>
                            <button class="cant-btn" data-cant="15">15</button>
                            <button class="cant-btn" data-cant="20">20</button>
                        </div>
                    </div>
                    <div class="opcion-grupo">
                        <label class="opcion-label">Tipos de pregunta</label>
                        <div class="tipos-checks">
                            <label class="tipo-check"><input type="checkbox" name="tipo-pregunta" value="conceptos" checked><span class="tipo-check__box" style="--color:#3b82f6"></span><span>Concepto desarrollado por el título</span></label>
                            <label class="tipo-check"><input type="checkbox" name="tipo-pregunta" value="titulos" checked><span class="tipo-check__box" style="--color:#8b5cf6"></span><span>Relacionar párrafo con su título</span></label>
                            <label class="tipo-check"><input type="checkbox" name="tipo-pregunta" value="verdadero-falso" checked><span class="tipo-check__box" style="--color:#f59e0b"></span><span>Verdadero o Falso</span></label>
                            <label class="tipo-check"><input type="checkbox" name="tipo-pregunta" value="completar"><span class="tipo-check__box" style="--color:#22c55e"></span><span>Completar el texto</span></label>
                        </div>
                    </div>
                    <button class="btn btn--gold btn--lg btn--full" id="btn-iniciar-quiz">Analizar libro y generar preguntas</button>
                    <div id="config-error" class="config-error" style="display:none"></div>
                </div>
            </div>
        `;
        document.getElementById('btn-back-config')?.addEventListener('click', () => {
            if (libro.esLibroComunidad) this.navegarA('comunidad', { groupId: libro.grupoId });
            else this.navegarA('libros-pdf');
        });
        let cantidad = 10;
        document.querySelectorAll('.cant-btn').forEach(button => button.addEventListener('click', () => {
            document.querySelectorAll('.cant-btn').forEach(item => item.classList.remove('cant-btn--active'));
            button.classList.add('cant-btn--active');
            cantidad = Number(button.dataset.cant);
        }));
        document.getElementById('btn-iniciar-quiz')?.addEventListener('click', async () => {
            await this._iniciarQuiz(libro.id, 'lectura', cantidad);
        });
    },

    _htmlRangoArticulos() {
        return `
            <div class="rango-articulos">
                <div class="rango-inputs">
                    <div class="rango-input-wrap">
                        <label>Desde el artículo</label>
                        <input type="number" id="art-desde" class="input-num" min="1" value="1" placeholder="1">
                    </div>
                    <div class="rango-sep">—</div>
                    <div class="rango-input-wrap">
                        <label>Hasta el artículo</label>
                        <input type="number" id="art-hasta" class="input-num" min="1" value="50" placeholder="50">
                    </div>
                </div>
                <p class="rango-hint">💡 Si no conoces el rango exacto, usa los otros filtros (Título, Capítulo).</p>
            </div>`;
    },

    _htmlRangoSelect(items, tipo) {
        if (!items || items.length === 0) {
            return `<p class="rango-empty">⚠️ No se detectaron ${tipo}s en este documento. Usa el filtro por Artículo.</p>`;
        }
        return `
            <div class="rango-select-wrap">
                <label>Seleccionar ${tipo}</label>
                <select id="rango-select" class="select-styled">
                    ${items.map(item => `
                        <option value="${item.linea}">${item.linea}${item.nombre ? ' — ' + item.nombre : ''}</option>
                    `).join('')}
                </select>
            </div>`;
    },

    _attachConfigEvents(leyIdInicial) {
        let leySeleccionadaId = leyIdInicial;
        let rangoTipoActual = 'articulos';
        let cantidadActual = 10;

        // Selección de ley
        document.querySelectorAll('.ley-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.ley-option').forEach(o => o.classList.remove('ley-option--selected'));
                opt.classList.add('ley-option--selected');
                opt.querySelector('input').checked = true;
                leySeleccionadaId = opt.dataset.leyId;
                this._preCargarEstructura(leySeleccionadaId, rangoTipoActual);
            });
        });

        // Tabs de tipo de rango
        document.querySelectorAll('.rango-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.rango-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                rangoTipoActual = tab.dataset.rango;
                this._actualizarRangoPanel(leySeleccionadaId, rangoTipoActual);
            });
        });

        // Botones de cantidad
        document.querySelectorAll('.cant-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cant-btn').forEach(b => b.classList.remove('cant-btn--active'));
                btn.classList.add('cant-btn--active');
                cantidadActual = parseInt(btn.dataset.cant);
            });
        });

        // Botón iniciar
        document.getElementById('btn-iniciar-quiz')?.addEventListener('click', async () => {
            await this._iniciarQuiz(leySeleccionadaId, rangoTipoActual, cantidadActual);
        });
    },

    async _preCargarEstructura(leyId, tipoRango = 'articulos') {
        const ley = LEYES_DATA.find(l => l.id === leyId);
        if (!ley) return;

        const infoDiv = document.getElementById('rango-info');
        const infoText = document.getElementById('rango-info-text');
        if (infoDiv) infoDiv.style.display = 'flex';
        if (infoText) infoText.textContent = 'Cargando estructura del PDF...';

        try {
            const estructura = await this.parser.cargarYParsear(ley.archivo, (pct, msg) => {
                if (infoText) infoText.textContent = msg;
            });
            this.estado.estructura = estructura;
            this.estado.leyActualId = leyId;

            if (infoDiv) infoDiv.style.display = 'none';
            this._actualizarRangoPanel(leyId, tipoRango, estructura);
        } catch (e) {
            if (infoDiv) infoDiv.style.display = 'none';
            this._mostrarConfigError(e.message);
        }
    },

    _actualizarRangoPanel(leyId, tipo, estructuraCargada = null) {
        const panel = document.getElementById('rango-panel');
        if (!panel) return;

        const est = estructuraCargada || this.estado.estructura;

        if (!est && tipo !== 'articulos') {
            panel.innerHTML = `
                <div class="rango-loading">
                    <div class="spinner-sm"></div>
                    <span>Cargando estructura del PDF...</span>
                </div>`;
            this._preCargarEstructura(leyId, tipo);
            return;
        }

        switch (tipo) {
            case 'articulos':
                const maxArt = est ? Math.max(...est.articulos.map(a => a.numero), 1) : 999;
                panel.innerHTML = `
                    <div class="rango-articulos">
                        <div class="rango-inputs">
                            <div class="rango-input-wrap">
                                <label>Desde el artículo</label>
                                <input type="number" id="art-desde" class="input-num" min="1" max="${maxArt}" value="1">
                            </div>
                            <div class="rango-sep">—</div>
                            <div class="rango-input-wrap">
                                <label>Hasta el artículo</label>
                                <input type="number" id="art-hasta" class="input-num" min="1" max="${maxArt}" value="${Math.min(50, maxArt)}">
                            </div>
                        </div>
                        ${est ? `<p class="rango-hint">✅ Esta ley tiene artículos del <strong>1</strong> al <strong>${maxArt}</strong></p>` : ''}
                    </div>`;
                break;

            case 'titulo':
                panel.innerHTML = this._htmlRangoSelect(est?.titulos || [], 'Título');
                break;

            case 'capitulo':
                panel.innerHTML = this._htmlRangoSelect(est?.capitulos || [], 'Capítulo');
                break;

            case 'parte':
                const partesData = est?.partes || [];
                if (partesData.length === 0) {
                    panel.innerHTML = `<p class="rango-empty">⚠️ Este documento no está dividido en Partes. Usa otro filtro.</p>`;
                } else {
                    panel.innerHTML = this._htmlRangoSelect(partesData, 'Parte');
                }
                break;
        }
    },

    async _iniciarQuiz(leyId, rangoTipo, cantidad) {
        const errorDiv = document.getElementById('config-error');
        if (errorDiv) errorDiv.style.display = 'none';

        // Validar tipos seleccionados
        const tiposChecks = document.querySelectorAll('input[name="tipo-pregunta"]:checked');
        const tipos = [...tiposChecks].map(c => c.value);
        if (tipos.length === 0) {
            this._mostrarConfigError('Selecciona al menos un tipo de pregunta.');
            return;
        }

        const documento = this._obtenerDocumento(leyId);
        if (!documento) {
            this._mostrarConfigError('No se encontró el documento seleccionado. Vuelve a abrirlo desde la biblioteca.');
            return;
        }

        // Obtener rango
        let rangoDesde, rangoHasta;
        if (!documento.esLibro && rangoTipo === 'articulos') {
            rangoDesde = parseInt(document.getElementById('art-desde')?.value) || 1;
            rangoHasta = parseInt(document.getElementById('art-hasta')?.value) || 50;
            if (rangoDesde > rangoHasta) {
                this._mostrarConfigError('"Desde" no puede ser mayor que "Hasta".');
                return;
            }
        } else if (!documento.esLibro) {
            const select = document.getElementById('rango-select');
            rangoDesde = select?.value;
            rangoHasta = select?.value;
        }

        // Mostrar carga si no tenemos estructura
        if (!this.estado.estructura || this.estado.leyActualId !== leyId) {
            this.mostrarCargando('Preparando quiz...');
            try {
                const est = await this.parser.cargarYParsear(documento.archivo, (pct, msg) => {
                    this.actualizarCargando(pct, msg);
                });
                this.estado.estructura = est;
                this.estado.leyActualId = leyId;
            } catch (e) {
                this.ocultarCargando();
                this._mostrarConfigError(e.message);
                return;
            }
            this.ocultarCargando();
        }

        // Filtrar artículos
        // Generar preguntas
        let preguntas;
        try {
            if (documento.esLibro) {
                preguntas = this.engine.generarQuizLectura(
                    this.estado.estructura.fragmentos || [],
                    { cantidad, tipos },
                    this.estado.estructura.titulosLectura || [],
                    this.estado.estructura.apartadosLectura || []
                );
            } else {
                const articulos = this.parser.filtrarPorRango(
                    this.estado.estructura, rangoTipo, rangoDesde, rangoHasta
                );
                preguntas = this.engine.generarQuiz(articulos, { cantidad, tipos });
            }
        } catch (e) {
            this._mostrarConfigError(e.message);
            return;
        }

        if (preguntas.length === 0) {
            this._mostrarConfigError('No se pudieron generar preguntas con la configuración seleccionada. Intenta ampliar el rango.');
            return;
        }

        // Guardar estado y navegar al quiz
        this.estado.preguntas = preguntas;
        this.estado.preguntaIndex = 0;
        this.estado.respuestas = [];
        this.estado.respondidaActual = false;
        this.estado.quizConfig = { leyId, rangoTipo, rangoDesde, rangoHasta, cantidad: preguntas.length, tipos };

        // Incrementar contador de quizzes
        const count = parseInt(localStorage.getItem('bibliolex_quizzes_count') || '0');
        localStorage.setItem('bibliolex_quizzes_count', count + 1);

        this.navegarA('quiz');
    },

    _mostrarConfigError(msg) {
        const div = document.getElementById('config-error');
        if (div) {
            div.textContent = '⚠️ ' + msg;
            div.style.display = 'block';
            div.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    // ─────────────────────────────────────────────────────────
    //  VISTA: QUIZ ACTIVO
    // ─────────────────────────────────────────────────────────
    _renderQuiz() {
        const { preguntas, preguntaIndex } = this.estado;
        if (!preguntas || preguntas.length === 0) {
            this.navegarA('quiz-config');
            return;
        }

        const pregunta = preguntas[preguntaIndex];
        const total = preguntas.length;
        const progresoPct = Math.round((preguntaIndex / total) * 100);
        const ley = this._obtenerDocumento(this.estado.leyActualId);

        const main = document.getElementById('main-content');

        main.innerHTML = `
            <div class="quiz-wrap page-enter">
                <!-- Topbar -->
                <div class="quiz-topbar">
                    <button class="btn btn--ghost btn--sm" id="btn-salir-quiz">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Salir
                    </button>
                    <div class="quiz-topbar__center">
                        <span class="quiz-ley-badge">${ley?.icono || '⚖️'} ${this._escaparHTML(ley?.titulo || '')}</span>
                    </div>
                    <div class="quiz-contador">
                        <span class="quiz-contador__num">${preguntaIndex + 1}</span>
                        <span class="quiz-contador__sep">/</span>
                        <span class="quiz-contador__total">${total}</span>
                    </div>
                </div>

                <!-- Barra de progreso -->
                <div class="quiz-progress-bar">
                    <div class="quiz-progress-bar__fill" style="width: ${progresoPct}%"></div>
                </div>

                <!-- Tarjeta de pregunta -->
                <div class="quiz-content">
                    <div class="pregunta-card" id="pregunta-card">
                        <!-- Contexto / Breadcrumb -->
                        ${pregunta.contexto ? `<div class="pregunta-contexto">${this._escaparHTML(pregunta.contexto)}</div>` : ''}

                        <!-- Tipo badge -->
                        <div class="pregunta-tipo-badge" style="background: ${pregunta.tipoColor}22; color: ${pregunta.tipoColor}; border-color: ${pregunta.tipoColor}44">
                            ${pregunta.tipoLabel}
                        </div>

                        <!-- Texto de la pregunta -->
                        <h2 class="pregunta-texto">${pregunta.pregunta}</h2>

                        <!-- Fragmento (para tipo "identificar") -->
                        ${pregunta.fragmento ? `<blockquote class="pregunta-fragmento">${pregunta.fragmento}</blockquote>` : ''}

                        <!-- Enunciado (para V/F y completar) -->
                        ${pregunta.enunciado ? `<div class="pregunta-enunciado">${pregunta.enunciado}</div>` : ''}

                        <!-- Opciones -->
                        <div class="opciones-grid-quiz" id="opciones-container">
                            ${pregunta.opciones.map((op, i) => `
                                <button class="opcion-btn" data-idx="${i}" data-texto="${this._escapar(op)}">
                                    <span class="opcion-letra">${'ABCD'[i] || i + 1}</span>
                                    <span class="opcion-texto">${op}</span>
                                </button>
                            `).join('')}
                        </div>

                        <!-- Explicación (oculta hasta responder) -->
                        <div class="explicacion" id="explicacion" style="display:none">
                            <div class="explicacion__header">
                                <span id="explicacion-icono">✅</span>
                                <span id="explicacion-titulo">¡Correcto!</span>
                            </div>
                            <div class="explicacion__body" id="explicacion-body"></div>
                            <button class="btn btn--gold btn--full mt-3" id="btn-siguiente">
                                ${preguntaIndex + 1 < total ? 'Siguiente pregunta →' : 'Ver resultados →'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Eventos
        document.getElementById('btn-salir-quiz')?.addEventListener('click', () => {
            if (confirm('¿Salir del quiz? Perderás el progreso actual.')) {
                this.navegarA('quiz-config', { leyId: this.estado.leyActualId });
            }
        });

        document.querySelectorAll('.opcion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this.estado.respondidaActual) {
                    this._responder(btn.dataset.texto, pregunta);
                }
            });
        });
    },

    _responder(respuestaTexto, pregunta) {
        const esCorrecta = respuestaTexto.trim().toLowerCase() === pregunta.respuestaCorrecta.trim().toLowerCase();
        this.estado.respondidaActual = true;
        this.estado.respuestas.push({
            pregunta,
            respuesta: respuestaTexto,
            correcta: esCorrecta
        });

        // Colorear opciones
        document.querySelectorAll('.opcion-btn').forEach(btn => {
            const esEsta = btn.dataset.texto?.trim().toLowerCase() === respuestaTexto.trim().toLowerCase();
            const esCorrectaEsta = btn.dataset.texto?.trim().toLowerCase() === pregunta.respuestaCorrecta.trim().toLowerCase();
            btn.disabled = true;
            if (esCorrectaEsta) btn.classList.add('opcion-btn--correcta');
            else if (esEsta && !esCorrectaEsta) btn.classList.add('opcion-btn--incorrecta');
        });

        // Mostrar explicación
        const explicacionDiv = document.getElementById('explicacion');
        const iconoEl = document.getElementById('explicacion-icono');
        const tituloEl = document.getElementById('explicacion-titulo');
        const bodyEl = document.getElementById('explicacion-body');

        if (explicacionDiv) {
            iconoEl.textContent = esCorrecta ? '✅' : '❌';
            tituloEl.textContent = esCorrecta ? '¡Correcto!' : 'Incorrecto';
            explicacionDiv.classList.toggle('explicacion--correcta', esCorrecta);
            explicacionDiv.classList.toggle('explicacion--incorrecta', !esCorrecta);
            bodyEl.innerHTML = pregunta.explicacion.replace(/\n/g, '<br>');
            explicacionDiv.style.display = 'block';
            explicacionDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        document.getElementById('btn-siguiente')?.addEventListener('click', () => {
            this.estado.preguntaIndex++;
            this.estado.respondidaActual = false;
            if (this.estado.preguntaIndex < this.estado.preguntas.length) {
                this._renderQuiz();
            } else {
                this.navegarA('resultados');
            }
        });
    },

    _escapar(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _escaparHTML(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // ─────────────────────────────────────────────────────────
    //  VISTA: RESULTADOS
    // ─────────────────────────────────────────────────────────
    _renderResultados() {
        const { respuestas, preguntas } = this.estado;
        const correctas = respuestas.filter(r => r.correcta).length;
        const total = preguntas.length;
        const pct = Math.round((correctas / total) * 100);
        const ley = this._obtenerDocumento(this.estado.leyActualId);

        let mensajeClase = '', mensajeTexto = '', mensajeEmoji = '';
        if (pct >= 90)      { mensajeClase = 'gold'; mensajeTexto = '¡Excelente dominio!'; mensajeEmoji = '🏆'; }
        else if (pct >= 70) { mensajeClase = 'green'; mensajeTexto = '¡Buen trabajo!'; mensajeEmoji = '🎉'; }
        else if (pct >= 50) { mensajeClase = 'yellow'; mensajeTexto = 'Sigue practicando'; mensajeEmoji = '📚'; }
        else                { mensajeClase = 'red'; mensajeTexto = 'Necesitas repasar más'; mensajeEmoji = '💪'; }

        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="resultados-wrap page-enter">
                <div class="resultados-hero">
                    <div class="resultados-score resultados-score--${mensajeClase}">
                        <svg class="score-ring" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="8" opacity="0.15"/>
                            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="8"
                                stroke-dasharray="${2 * Math.PI * 52}"
                                stroke-dashoffset="${2 * Math.PI * 52 * (1 - pct / 100)}"
                                stroke-linecap="round"
                                class="score-ring__fill"
                                style="transform: rotate(-90deg); transform-origin: 60px 60px"/>
                            <text x="60" y="55" text-anchor="middle" class="score-pct-text" font-size="26" font-weight="bold">${pct}%</text>
                            <text x="60" y="75" text-anchor="middle" class="score-sub-text" font-size="11">${correctas}/${total}</text>
                        </svg>
                    </div>
                    <div class="resultados-hero__info">
                        <div class="resultado-emoji">${mensajeEmoji}</div>
                        <h1 class="resultado-mensaje">${mensajeTexto}</h1>
                        <p class="resultado-sub">
                            <strong>${correctas}</strong> correctas de <strong>${total}</strong> preguntas
                        </p>
                        <p class="resultado-ley">${ley?.icono || ''} ${this._escaparHTML(ley?.titulo || '')}</p>
                    </div>
                </div>

                <div class="resultados-acciones">
                    <button class="btn btn--gold" id="btn-nuevo-quiz">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                        </svg>
                        Nuevo Quiz
                    </button>
                    <button class="btn btn--outline" id="btn-volver-lib">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        Biblioteca
                    </button>
                </div>

                <!-- Revisión de preguntas -->
                <div class="revision-section">
                    <h2 class="revision-titulo">Revisión de respuestas</h2>
                    <div class="revision-lista">
                        ${respuestas.map((r, i) => this._htmlRevision(r, i)).join('')}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-nuevo-quiz')?.addEventListener('click', () => {
            this.navegarA('quiz-config', { leyId: this.estado.leyActualId });
        });
        document.getElementById('btn-volver-lib')?.addEventListener('click', () => {
            this.navegarA('biblioteca');
        });

        // Toggle explicaciones
        document.querySelectorAll('.revision-item__toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const body = btn.closest('.revision-item').querySelector('.revision-item__body');
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                btn.textContent = isOpen ? 'Ver explicación ▼' : 'Ocultar ▲';
            });
        });
    },

    _htmlRevision(r, idx) {
        const p = r.pregunta;
        return `
        <div class="revision-item revision-item--${r.correcta ? 'ok' : 'error'}">
            <div class="revision-item__header">
                <div class="revision-num">${idx + 1}</div>
                <div class="revision-item__meta">
                    <span class="revision-tipo" style="color: ${p.tipoColor}">${p.tipoLabel}</span>
                    <span class="revision-art">Art. ${p.articuloRef}</span>
                </div>
                <div class="revision-result">
                    ${r.correcta ? '<span class="badge badge--green">✓ Correcto</span>' : '<span class="badge badge--red">✗ Incorrecto</span>'}
                </div>
            </div>
            <div class="revision-pregunta">${p.pregunta}</div>
            ${!r.correcta ? `
            <div class="revision-respuestas">
                <div class="revision-resp revision-resp--tuya">Tu respuesta: <em>${this._resumirCorto(r.respuesta)}</em></div>
                <div class="revision-resp revision-resp--correcta">Respuesta correcta: <em>${this._resumirCorto(p.respuestaCorrecta)}</em></div>
            </div>` : ''}
            <button class="revision-item__toggle">Ver explicación ▼</button>
            <div class="revision-item__body" style="display:none">
                <div class="revision-explicacion">${p.explicacion.replace(/\n/g, '<br>')}</div>
            </div>
        </div>`;
    },

    _resumirCorto(texto, max = 100) {
        if (!texto) return '—';
        if (texto.length <= max) return texto;
        return texto.substring(0, max) + '...';
    },

    // ─────────────────────────────────────────────────────────
    //  LOADING OVERLAY
    // ─────────────────────────────────────────────────────────
    mostrarCargando(msg = 'Cargando...') {
        this.estado.cargando = true;
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('loading-overlay--visible');
            this.actualizarCargando(0, msg);
        }
    },

    actualizarCargando(pct, msg) {
        const textEl = document.getElementById('loading-text');
        const fillEl = document.getElementById('loading-bar-fill');
        const pctEl  = document.getElementById('loading-percent');
        if (textEl) textEl.textContent = msg;
        if (fillEl) fillEl.style.width = pct + '%';
        if (pctEl)  pctEl.textContent = pct + '%';
    },

    ocultarCargando() {
        this.estado.cargando = false;
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('loading-overlay--visible');
    }
};

// Arranque
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(error => {
        console.error('No se pudo iniciar Biblioluch:', error);
        const main = document.getElementById('main-content');
        if (main) {
            main.innerHTML = `<div class="auth-setup-note">No se pudo iniciar la aplicación: ${App._escaparHTML(error.message)}</div>`;
        }
    });
});
