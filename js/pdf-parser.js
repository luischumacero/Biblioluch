/**
 * pdf-parser.js — Carga, extrae texto y parsea la estructura
 * jerárquica de los PDFs legales bolivianos usando PDF.js.
 */

class PDFParser {
    constructor() {
        this._configurarWorker();
    }

    _configurarWorker() {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    /**
     * Carga un PDF, extrae su texto y parsea la estructura.
     * Usa caché en localStorage para evitar re-procesar.
     * @param {string} url - Ruta al PDF
     * @param {Function} onProgreso - Callback(porcentaje, mensaje)
     * @returns {Object} Estructura jerárquica del PDF
     */
    async cargarYParsear(url, onProgreso = () => {}) {
        const claveCache = 'bibliolex_v2_' + url.replace(/[^a-z0-9]/gi, '_');

        // Intentar leer desde caché
        try {
            const cached = localStorage.getItem(claveCache);
            if (cached) {
                const data = JSON.parse(cached);
                // Verificar que tiene artículos
                if (data.articulos && data.articulos.length > 0) {
                    onProgreso(100, `Cargado desde caché (${data.articulos.length} artículos)`);
                    return data;
                }
            }
        } catch (e) {
            localStorage.removeItem(claveCache);
        }

        // Cargar PDF con PDF.js
        onProgreso(5, 'Conectando con el PDF...');

        let pdf;
        try {
            const tarea = pdfjsLib.getDocument({ url, verbosity: 0 });
            pdf = await tarea.promise;
        } catch (e) {
            throw new Error(
                'No se pudo cargar el PDF. Asegúrate de usar el servidor local (start.bat).\n' +
                'Detalle: ' + e.message
            );
        }

        const totalPaginas = pdf.numPages;
        onProgreso(10, `PDF abierto — ${totalPaginas} páginas`);

        // Extraer texto página por página
        let textoCompleto = '';
        for (let i = 1; i <= totalPaginas; i++) {
            const pagina = await pdf.getPage(i);
            const contenido = await pagina.getTextContent();
            textoCompleto += this._textosDePagina(contenido) + '\n--- SALTO DE PAGINA ---\n';

            const progreso = 10 + Math.floor((i / totalPaginas) * 65);
            onProgreso(progreso, `Extrayendo página ${i} de ${totalPaginas}...`);
        }

        onProgreso(78, 'Analizando estructura jurídica...');

        // Parsear estructura
        const estructura = this.parsearEstructura(textoCompleto);
        estructura.totalPaginas = totalPaginas;

        onProgreso(95, `Encontrados ${estructura.articulos.length} artículos`);

        // Guardar en caché (manejo de cuota)
        try {
            localStorage.setItem(claveCache, JSON.stringify(estructura));
        } catch (e) {
            // Si la cuota se excede, limpiar ítems viejos
            this._limpiarCache();
            try { localStorage.setItem(claveCache, JSON.stringify(estructura)); } catch (_) {}
        }

        onProgreso(100, '¡Análisis completado!');
        return estructura;
    }

    /**
     * Extrae texto de una página de PDF.js, manteniendo saltos de línea.
     */
    _textosDePagina(contenido) {
        if (!contenido.items || contenido.items.length === 0) return '';

        let lineas = [];
        let lineaActual = '';
        let yAnterior = null;

        for (const item of contenido.items) {
            if (!item.str) continue;

            const y = Math.round(item.transform[5]);

            if (yAnterior !== null && Math.abs(y - yAnterior) > 3) {
                if (lineaActual.trim()) lineas.push(lineaActual.trim());
                lineaActual = '';
            }

            lineaActual += item.str;
            if (!item.str.endsWith(' ')) lineaActual += ' ';
            yAnterior = y;
        }

        if (lineaActual.trim()) lineas.push(lineaActual.trim());

        return lineas.join('\n');
    }

    /**
     * Parsea el texto crudo y construye la estructura jerárquica:
     * Partes → Títulos → Capítulos → Secciones → Artículos
     */
    parsearEstructura(texto) {
        const estructura = {
            partes: [],
            libros: [],
            titulos: [],
            capitulos: [],
            secciones: [],
            articulos: []
        };

        // Normalizar: unir líneas rotas y limpiar
        const lineas = texto
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && l !== '--- SALTO DE PAGINA ---');

        // Contexto jerárquico actual
        let ctx = { parte: null, libro: null, titulo: null, capitulo: null, seccion: null };
        let articuloActual = null;
        let bufferContenido = [];

        // Expresiones regulares para detectar estructura
        const RE = {
            // Partes
            parte: /^\s*(?:PARTE\s+(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA|D[EÉ]CIMA|[UÚ]NICA|[IVXLCDM]+|GENERAL|PRELIMINAR)|(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENO|D[EÉ]CIMA|[UÚ]NICA|[IVXLCDM]+|GENERAL|PRELIMINAR)\s+PARTE)[\s:\-]*(.*)?$/i,
            
            // Libros
            libro: /^\s*(?:LIBRO)\s+(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO|[UÚ]NICO|[IVXLCDM]+|GENERAL|PRELIMINAR)[\s:\-]*(.*)?$/i,

            // Títulos
            titulo: /^(?:T[IÍ]TULO)\s+([IVXLCDM]+|(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO|[UÚ]NICO|[A-ZÁÉÍÓÚÑ\s]+))[\s:\-]*(.*)?$/i,

            // Capítulos
            capitulo: /^(?:CAP[IÍ]TULO)\s+([IVXLCDM]+|\d+|(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|[UÚ]NICO|[A-ZÁÉÍÓÚÑ\s]+))[\s:\-]*(.*)?$/i,

            // Secciones
            seccion: /^(?:SECCI[OÓ]N)\s+([IVXLCDM]+|\d+|(?:PRIMERA|SEGUNDA|TERCERA|[UÚ]NICA|[A-ZÁÉÍÓÚÑ\s]+))[\s:\-]*(.*)?$/i,

            // Artículos con variantes: BIS, TER, QUATER, QUINQUIES, SEXIES, etc.
            articulo: /^(?:ART[IÍ]CULO|ART\.?)\s*\.?\s*(\d+)\s*(BIS|TER|QUATER|QUINQUIES|SEXIES|SEPTIES|OCTIES|NOVIES)?[°\.\-]?\s*(.*)?$/i,

            // Líneas a ignorar (números de página, encabezados)
            ignorar: /^(?:\d{1,3}|MINISTERIO\s+DE|GOBIERNO\s+DE|LEY\s+N[°º]|ESTADO\s+PLURINACIONAL)[\s]*$/i
        };

        const guardarArticulo = () => {
            if (!articuloActual) return;
            const contenido = bufferContenido.join(' ').replace(/\s+/g, ' ').trim();
            if (contenido.length > 15) {
                articuloActual.contenido = contenido;
                estructura.articulos.push({ ...articuloActual });
            }
            articuloActual = null;
            bufferContenido = [];
        };

        for (const linea of lineas) {
            if (RE.ignorar.test(linea)) continue;

            // --- PARTE ---
            if (RE.parte.test(linea)) {
                const m = linea.match(RE.parte);
                if (ctx.parte && ctx.parte.linea === linea) continue;
                guardarArticulo();
                const nombreParte = (m[1] || m[2] || '').trim();
                ctx.parte = { nombre: nombreParte, linea: linea };
                ctx.libro = null; ctx.titulo = null; ctx.capitulo = null; ctx.seccion = null;
                estructura.partes.push({ ...ctx.parte });
                continue;
            }

            // --- LIBRO ---
            if (RE.libro.test(linea)) {
                const m = linea.match(RE.libro);
                if (ctx.libro && ctx.libro.linea === linea) continue;
                guardarArticulo();
                ctx.libro = { nombre: m[1] ? m[1].trim() : '', linea: linea, parte: ctx.parte ? ctx.parte.linea : null };
                ctx.titulo = null; ctx.capitulo = null; ctx.seccion = null;
                estructura.libros.push({ ...ctx.libro });
                continue;
            }

            // --- TÍTULO ---
            if (RE.titulo.test(linea)) {
                const m = linea.match(RE.titulo);
                const numTit = m[1].trim();

                // Encabezado de página repetido: mismo título que el actual → ignorar
                if (ctx.titulo && ctx.titulo.numero === numTit) continue;

                guardarArticulo();
                ctx.titulo = {
                    numero: numTit,
                    nombre: m[2] ? m[2].trim() : '',
                    linea: linea,
                    parte: ctx.parte ? ctx.parte.linea : null, libro: ctx.libro ? ctx.libro.linea : null
                };
                ctx.capitulo = null; ctx.seccion = null;

                // Agregar a la lista de estructura
                estructura.titulos.push({ ...ctx.titulo });
                continue;
            }

            // --- CAPÍTULO ---
            if (RE.capitulo.test(linea)) {
                const m = linea.match(RE.capitulo);
                const numCap = m[1].trim();
                const tituloLinea = ctx.titulo ? ctx.titulo.linea : null;

                // Encabezado de página repetido: mismo capítulo dentro del mismo título → ignorar
                if (ctx.capitulo &&
                    ctx.capitulo.numero === numCap &&
                    ctx.capitulo.titulo === tituloLinea) continue;

                guardarArticulo();
                ctx.capitulo = {
                    numero: numCap,
                    nombre: m[2] ? m[2].trim() : '',
                    linea: linea,
                    titulo: tituloLinea,
                    tituloNum: ctx.titulo ? ctx.titulo.numero : null,
                    parte: ctx.parte ? ctx.parte.linea : null, libro: ctx.libro ? ctx.libro.linea : null
                };
                ctx.seccion = null;

                // Agregar a la lista de estructura
                estructura.capitulos.push({ ...ctx.capitulo });
                continue;
            }

            // --- SECCIÓN ---
            if (RE.seccion.test(linea)) {
                guardarArticulo();
                const m = linea.match(RE.seccion);
                ctx.seccion = {
                    numero: m[1] ? m[1].trim() : '',
                    nombre: m[2] ? m[2].trim() : '',
                    linea: linea,
                    capitulo: ctx.capitulo ? ctx.capitulo.linea : null,
                    titulo: ctx.titulo ? ctx.titulo.linea : null,
                    libro: ctx.libro ? ctx.libro.linea : null,
                    parte: ctx.parte ? ctx.parte.linea : null
                };
                estructura.secciones.push({ ...ctx.seccion });
                continue;
            }

            // --- ARTÍCULO ---
            if (RE.articulo.test(linea)) {
                guardarArticulo();
                const m = linea.match(RE.articulo);
                articuloActual = {
                    numero: parseInt(m[1], 10),
                    variante: m[2] ? m[2].trim().toUpperCase() : null,   // BIS, TER, QUATER…
                    numeroCompleto: m[2] ? `${parseInt(m[1],10)} ${m[2].trim().toUpperCase()}` : String(parseInt(m[1],10)),
                    parte: ctx.parte ? ctx.parte.linea : null, libro: ctx.libro ? ctx.libro.linea : null,
                    titulo: ctx.titulo ? ctx.titulo.linea : null,
                    tituloNum: ctx.titulo ? ctx.titulo.numero : null,
                    tituloNombre: ctx.titulo ? ctx.titulo.nombre : null,
                    capitulo: ctx.capitulo ? ctx.capitulo.linea : null,
                    capituloNum: ctx.capitulo ? ctx.capitulo.numero : null,
                    capituloNombre: ctx.capitulo ? ctx.capitulo.nombre : null,
                    seccion: ctx.seccion ? ctx.seccion.linea : null,
                    contenido: ''
                };
                if (m[3] && m[3].trim()) bufferContenido = [m[3].trim()];
                continue;
            }

            // --- Contenido del artículo actual ---
            if (articuloActual) {
                // Ignorar si parece número de página o encabezado repetido
                if (/^\d{1,3}$/.test(linea)) continue;
                bufferContenido.push(linea);
            }
        }

        guardarArticulo();

        // Deduplicar artículos: si un artículo aparece más de una vez
        // (por encabezados de página que resetearon el contexto), quedarse con
        // el que tenga más contenido. Clave = número + variante.
        const artMap = new Map();
        for (const art of estructura.articulos) {
            const clave = String(art.numero) + (art.variante || '');
            const existente = artMap.get(clave);
            if (!existente || art.contenido.length > existente.contenido.length) {
                artMap.set(clave, art);
            }
        }
        estructura.articulos = Array.from(artMap.values()).sort((a, b) => {
            if (a.numero !== b.numero) return a.numero - b.numero;
            // Mismo número, ordenar variantes: base → BIS → TER → QUATER…
            const orden = ['', 'BIS', 'TER', 'QUATER', 'QUINQUIES', 'SEXIES', 'SEPTIES', 'OCTIES'];
            return orden.indexOf(a.variante || '') - orden.indexOf(b.variante || '');
        });

        return estructura;
    }

    /**
     * Filtra artículos según el tipo de rango seleccionado.
     */
    filtrarPorRango(estructura, tipo, desde, hasta) {
        const arts = estructura.articulos;

        switch (tipo) {
            case 'articulos':
                return arts.filter(a => a.numero >= Number(desde) && a.numero <= Number(hasta));

            case 'titulo':
                return arts.filter(a => {
                    if (!a.tituloNum) return false;
                    const num = a.tituloNum.toString().trim();
                    return num === desde.toString().trim() || a.titulo === desde;
                });

            case 'capitulo':
                return arts.filter(a => {
                    if (!a.capituloNum) return false;
                    const num = a.capituloNum.toString().trim();
                    return num === desde.toString().trim() || a.capitulo === desde;
                });

            case 'parte':
                return arts.filter(a => a.parte === desde);

            default:
                return arts;
        }
    }

    _limpiarCache() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('bibliolex_'));
        keys.sort().slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    }

    /** Borra el caché de un PDF específico (para forzar re-parseo) */
    limpiarCachePDF(url) {
        const clave = 'bibliolex_v2_' + url.replace(/[^a-z0-9]/gi, '_');
        localStorage.removeItem(clave);
    }
}
