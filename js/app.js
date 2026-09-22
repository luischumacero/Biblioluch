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
        favoritos: JSON.parse(localStorage.getItem('bibliolex_favs') || '{}'),
        estadisticas: JSON.parse(localStorage.getItem('bibliolex_stats') || '{}')
    },

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
    init() {
        this.parser = new PDFParser();
        this.engine = new QuizEngine();
        this._attachSidebarEvents();
        this.navegarA('biblioteca');
    },

    _attachSidebarEvents() {
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const destino = el.dataset.nav;
                if (destino === 'biblioteca') this.navegarA('biblioteca');
                if (destino === 'quiz-config') this.navegarA('quiz-config');
            });
        });

        // Theme initialization
        const savedTheme = localStorage.getItem('bibliolex_theme');
        if (savedTheme === 'light') {
            document.body.classList.add('theme-light');
            const btn = document.getElementById('btn-toggle-theme');
            if (btn) btn.textContent = '🌙 Cambiar Tema';
        }

        document.getElementById('btn-toggle-theme')?.addEventListener('click', (e) => {
            const isLight = document.body.classList.toggle('theme-light');
            localStorage.setItem('bibliolex_theme', isLight ? 'light' : 'dark');
            e.target.textContent = isLight ? '🌙 Cambiar Tema' : '☀️ Cambiar Tema';
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
        this.estado.vista = vista;

        // Actualizar nav activo
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.classList.toggle('active', el.dataset.nav === vista);
        });

        // Renderizar la vista correspondiente
        switch (vista) {
            case 'biblioteca':    this._renderBiblioteca(); break;
            case 'lector':        this._renderLector(params.leyId); break;
            case 'quiz-config':   this._renderQuizConfig(params.leyId); break;
            case 'quiz':          this._renderQuiz(); break;
            case 'resultados':    this._renderResultados(); break;
        }
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
                            <span class="badge badge--gold">Fiscalía General del Estado Plurinacional de Bolivia</span>
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
            const clave = 'bibliolex_v2_' + ley.archivo.replace(/[^a-z0-9]/gi, '_');
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
        const ley = LEYES_DATA.find(l => l.id === leyId);
        if (!ley) { this.navegarA('biblioteca'); return; }

        this.estado.leyActualId = leyId;
        const main = document.getElementById('main-content');

        main.innerHTML = `
            <div class="lector-wrap page-enter">
                <div class="lector-topbar">
                    <button class="btn btn--ghost btn-back" id="btn-back-lector">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Biblioteca
                    </button>
                    <div class="lector-topbar__title">
                        <span class="lector-topbar__icon">${ley.icono}</span>
                        <span>${ley.titulo}</span>
                    </div>
                    <button class="btn btn--gold" id="btn-quiz-desde-lector" data-ley-id="${leyId}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
                        </svg>
                        Generar Quiz
                    </button>
                </div>

                <div class="lector-body">
                    <aside class="lector-sidebar" id="lector-sidebar">
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
                    </aside>

                    <div class="lector-pdf-wrap">
                        <object
                            id="pdf-iframe"
                            class="pdf-iframe"
                            data="${ley.archivo}#view=FitV"
                            type="application/pdf"
                            title="${ley.titulo}"
                        >
                            <div style="padding: 20px; text-align: center;">
                                <p style="margin-bottom: 10px;">Tu celular requiere abrir el PDF en una pestaña nueva para verlo completo.</p>
                                <a href="${ley.archivo}" target="_blank" class="btn btn--gold">Abrir PDF Completo</a>
                            </div>
                        </object>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-back-lector')?.addEventListener('click', () => this.navegarA('biblioteca'));
        document.getElementById('btn-quiz-desde-lector')?.addEventListener('click', () => {
            this.navegarA('quiz-config', { leyId });
        });

        // Cargar estructura en background para el sidebar
        this._cargarEstructuraSidebar(ley);
    },

    async _cargarEstructuraSidebar(ley) {
        try {
            const estructura = await this.parser.cargarYParsear(ley.archivo);
            this.estado.estructura = estructura;
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

        // Obtener rango
        let rangoDesde, rangoHasta;
        if (rangoTipo === 'articulos') {
            rangoDesde = parseInt(document.getElementById('art-desde')?.value) || 1;
            rangoHasta = parseInt(document.getElementById('art-hasta')?.value) || 50;
            if (rangoDesde > rangoHasta) {
                this._mostrarConfigError('"Desde" no puede ser mayor que "Hasta".');
                return;
            }
        } else {
            const select = document.getElementById('rango-select');
            rangoDesde = select?.value;
            rangoHasta = select?.value;
        }

        // Mostrar carga si no tenemos estructura
        if (!this.estado.estructura || this.estado.leyActualId !== leyId) {
            this.mostrarCargando('Preparando quiz...');
            const ley = LEYES_DATA.find(l => l.id === leyId);
            try {
                const est = await this.parser.cargarYParsear(ley.archivo, (pct, msg) => {
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
        const articulos = this.parser.filtrarPorRango(
            this.estado.estructura, rangoTipo, rangoDesde, rangoHasta
        );

        // Generar preguntas
        let preguntas;
        try {
            preguntas = this.engine.generarQuiz(articulos, { cantidad, tipos });
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
        const ley = LEYES_DATA.find(l => l.id === this.estado.leyActualId);

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
                        <span class="quiz-ley-badge">${ley?.icono || '⚖️'} ${ley?.titulo || ''}</span>
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
                        ${pregunta.contexto ? `<div class="pregunta-contexto">${pregunta.contexto}</div>` : ''}

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
        return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // ─────────────────────────────────────────────────────────
    //  VISTA: RESULTADOS
    // ─────────────────────────────────────────────────────────
    _renderResultados() {
        const { respuestas, preguntas } = this.estado;
        const correctas = respuestas.filter(r => r.correcta).length;
        const total = preguntas.length;
        const pct = Math.round((correctas / total) * 100);
        const ley = LEYES_DATA.find(l => l.id === this.estado.leyActualId);

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
                        <p class="resultado-ley">${ley?.icono || ''} ${ley?.titulo || ''}</p>
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
document.addEventListener('DOMContentLoaded', () => App.init());
