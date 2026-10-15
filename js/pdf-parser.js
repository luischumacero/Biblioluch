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
        const claveCache = 'bibliolex_v6_' + url.replace(/[^a-z0-9]/gi, '_');
        const cacheable = !/\/LIBROS(?:%20| )PDF\//i.test(url);

        // Intentar leer desde caché solo para las leyes incluidas en la aplicación.
        if (cacheable) {
            try {
                const cached = localStorage.getItem(claveCache);
                if (cached) {
                    const data = JSON.parse(cached);
                    if (data.articulos && data.fragmentos && (data.articulos.length > 0 || data.fragmentos.length > 0)) {
                        onProgreso(100, `Cargado desde caché (${data.articulos.length} artículos)`);
                        return data;
                    }
                }
            } catch (e) {
                localStorage.removeItem(claveCache);
            }
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
        let textoParaLectura = '';
        for (let i = 1; i <= totalPaginas; i++) {
            const pagina = await pdf.getPage(i);
            const contenido = await pagina.getTextContent();
            textoCompleto += this._textosDePagina(contenido) + '\n--- SALTO DE PAGINA ---\n';
            textoParaLectura += this._textosDePagina(contenido, true) + '\n--- SALTO DE PAGINA ---\n';

            const progreso = 10 + Math.floor((i / totalPaginas) * 65);
            onProgreso(progreso, `Extrayendo página ${i} de ${totalPaginas}...`);
        }

        onProgreso(78, 'Analizando estructura jurídica...');

        // Parsear estructura
        const estructura = this.parsearEstructura(textoCompleto);
        const analisisLectura = this.analizarTextoLectura(textoParaLectura);
        estructura.fragmentos = analisisLectura.fragmentos;
        estructura.titulosLectura = analisisLectura.titulos;
        estructura.apartadosLectura = analisisLectura.apartados;
        estructura.totalPaginas = totalPaginas;

        onProgreso(95, `Encontrados ${estructura.articulos.length} artículos`);

        // Guardar en caché (manejo de cuota)
        try {
            if (cacheable) localStorage.setItem(claveCache, JSON.stringify(estructura));
        } catch (e) {
            // Si la cuota se excede, limpiar ítems viejos
            if (cacheable) {
                this._limpiarCache();
                try { localStorage.setItem(claveCache, JSON.stringify(estructura)); } catch (_) {}
            }
        }

        onProgreso(100, '¡Análisis completado!');
        return estructura;
    }

    analizarTextoLectura(texto) {
        const lineas = texto
            .split(/\n|--- SALTO DE PAGINA ---/)
            .map(linea => linea.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .map(linea => {
                const match = linea.match(/^\u0001ENCABEZADO:(\d)\u0001(.*)$/);
                return {
                    texto: match ? match[2].trim() : linea,
                    nivel: match ? Number(match[1]) : null
                };
            })
            .filter(linea => linea.texto);
        const frecuenciaLineas = new Map();
        for (const linea of lineas) {
            const clave = linea.texto.toLocaleLowerCase();
            frecuenciaLineas.set(clave, (frecuenciaLineas.get(clave) || 0) + 1);
        }

        const fragmentos = [];
        const titulos = [];
        const titulosVistos = new Set();
        const apartados = [];
        let tituloActual = '';
        let nivelTituloActual = 1;
        let buffer = [];
        let longitudBuffer = 0;
        const longitudObjetivo = 430;

        const guardarFragmento = () => {
            const contenido = buffer.join(' ').replace(/\s+/g, ' ').trim();
            if (contenido.length >= 90) {
                fragmentos.push({
                    numero: fragmentos.length + 1,
                    contenido,
                    titulo: tituloActual || null,
                    tituloId: tituloActual ? tituloActual.toLocaleLowerCase() : null,
                    nivelTitulo: nivelTituloActual
                });
            }
            buffer = [];
            longitudBuffer = 0;
        };

        for (const lineaInfo of lineas) {
            const linea = lineaInfo.texto;
            if (/^\d{1,4}$/.test(linea)) continue;
            const clave = linea.toLocaleLowerCase();
            const veces = frecuenciaLineas.get(clave) || 0;
            const esTitulo = lineaInfo.nivel !== null || this._pareceTituloLectura(linea);
            if (veces > 2 && esTitulo) continue;

            if (esTitulo) {
                guardarFragmento();
                tituloActual = linea;
                nivelTituloActual = lineaInfo.nivel || this._nivelTituloLectura(linea);
                if (!titulosVistos.has(clave)) {
                    titulosVistos.add(clave);
                    titulos.push(linea);
                }
                continue;
            }

            const oraciones = linea.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [linea];
            for (const oracion of oraciones) {
                const parte = oracion.trim();
                if (!parte) continue;
                if (longitudBuffer && longitudBuffer + parte.length > longitudObjetivo) {
                    guardarFragmento();
                }
                buffer.push(parte);
                longitudBuffer += parte.length + 1;
            }
        }
        guardarFragmento();

        const porTitulo = new Map();
        for (const fragmento of fragmentos) {
            if (!fragmento.tituloId) continue;
            if (!porTitulo.has(fragmento.tituloId)) {
                porTitulo.set(fragmento.tituloId, {
                    titulo: fragmento.titulo,
                    contenido: [],
                    fragmentos: []
                });
            }
            const apartado = porTitulo.get(fragmento.tituloId);
            apartado.contenido.push(fragmento.contenido);
            apartado.fragmentos.push(fragmento);
        }
        for (const apartado of porTitulo.values()) {
            const contenido = apartado.contenido.join(' ').replace(/\s+/g, ' ').trim();
            if (contenido.length >= 100) {
                apartados.push({
                    titulo: apartado.titulo,
                    contenido,
                    fragmentos: apartado.fragmentos,
                    nivel: apartado.fragmentos[0]?.nivelTitulo || 1
                });
            }
        }

        return { fragmentos, titulos, apartados };
    }

    _pareceTituloLectura(linea) {
        const limpio = linea.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').trim();
        if (limpio.length < 4 || limpio.length > 110 || /[.!?;:]$/.test(limpio)) return false;
        if (/^(?:CAP[IÍ]TULO|T[IÍ]TULO|SECCI[ÓO]N|PARTE|LIBRO|TEMA|UNIDAD|M[ÓO]DULO|INTRODUCCI[ÓO]N|CONCLUSI[ÓO]N|PR[ÓO]LOGO|EP[IÍ]LOGO|PREFACIO|ANEXO|AP[EÉ]NDICE|BIBLIOGRAF[IÍ]A)\b/i.test(limpio)) return true;
        if (/^(?:ART[IÍ]CULO|ART\.)\s*\d+/i.test(limpio)) return false;

        const palabras = limpio.split(/\s+/);
        if (palabras.length > 9) return false;
        const letras = limpio.match(/\p{L}/gu) || [];
        const mayusculas = limpio.match(/[A-ZÁÉÍÓÚÑ]/g) || [];
        if (letras.length >= 4 && mayusculas.length / letras.length > 0.72) return true;

        const empiezaEnumerado = /^\d+(?:\.\d+)*[.)]?\s+/.test(linea) ||
            /^(?:[IVXLCDM]+|[A-Z])[\.)]\s+/i.test(linea);
        if (empiezaEnumerado) return palabras.length <= 12;

        const conectores = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'en', 'para', 'por', 'con', 'al']);
        const palabrasEnMayusculaInicial = palabras.filter(palabra =>
            /^[A-ZÁÉÍÓÚÑ]/.test(palabra) || conectores.has(palabra.toLocaleLowerCase())
        ).length;
        const tieneFormaDeTitulo = palabrasEnMayusculaInicial >= Math.max(1, Math.ceil(palabras.length * 0.5));
        const contieneVerboComun = /\b(?:es|son|está|están|fue|fueron|será|serán|tiene|tienen|puede|pueden|debe|deben|permite|permiten|consiste|consisten|define|definen|establece|establecen|señala|señalan|considera|consideran)\b/i.test(limpio);
        return tieneFormaDeTitulo && !contieneVerboComun && palabras.length <= 7 && limpio.length <= 75;
    }

    _nivelTituloLectura(linea) {
        if (/^(?:CAP[IÍ]TULO|T[IÍ]TULO|PARTE|LIBRO|TEMA|UNIDAD|M[ÓO]DULO)\b/i.test(linea)) return 1;
        if (/^\d+(?:\.\d+)+/.test(linea)) return Math.min(4, (linea.match(/\./g) || []).length + 1);
        return 2;
    }

    /**
     * Extrae texto de una página de PDF.js, manteniendo saltos de línea.
     */
    _textosDePagina(contenido, marcarTitulos = false) {
        if (!contenido.items || contenido.items.length === 0) return '';

        let lineas = [];
        let lineaActual = '';
        let yAnterior = null;
        let tamanioActual = 0;
        let negritaActual = false;
        const tamanios = contenido.items
            .map(item => Math.max(Math.abs(item.transform?.[0] || 0), Math.abs(item.transform?.[3] || 0), item.height || 0))
            .filter(tamanio => tamanio > 0);
        const tamanioBase = tamanios.length
            ? [...tamanios].sort((a, b) => a - b)[Math.floor((tamanios.length - 1) / 2)]
            : 0;
        const guardarLinea = () => {
            if (!lineaActual.trim()) return;
            const texto = lineaActual.trim();
            const palabras = texto.split(/\s+/);
            const pareceEncabezado = texto.length >= 4 && texto.length <= 110 &&
                palabras.length <= 14 && !/[.!?;:]$/.test(texto);
            const destacadoPorTamanio = tamanioBase > 0 &&
                tamanioActual >= tamanioBase + 1.5 &&
                tamanioActual >= tamanioBase * 1.14;
            const destacadoPorFormato = negritaActual && palabras.length <= 9;
            const nivel = destacadoPorTamanio
                ? (tamanioActual >= tamanioBase * 1.5 ? 1 : 2)
                : 2;
            lineas.push(marcarTitulos && pareceEncabezado && (destacadoPorTamanio || destacadoPorFormato)
                ? `\u0001ENCABEZADO:${nivel}\u0001${texto}`
                : texto);
        };

        for (const item of contenido.items) {
            if (!item.str) continue;

            const y = Math.round(item.transform[5]);

            if (yAnterior !== null && Math.abs(y - yAnterior) > 3) {
                guardarLinea();
                lineaActual = '';
                tamanioActual = 0;
                negritaActual = false;
            }

            lineaActual += item.str;
            if (!item.str.endsWith(' ')) lineaActual += ' ';
            tamanioActual = Math.max(
                tamanioActual,
                Math.abs(item.transform?.[0] || 0),
                Math.abs(item.transform?.[3] || 0),
                item.height || 0
            );
            negritaActual ||= /bold|black|semibold|demi/i.test(item.fontName || '');
            yAnterior = y;
        }

        guardarLinea();

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
        const clave = 'bibliolex_v6_' + url.replace(/[^a-z0-9]/gi, '_');
        localStorage.removeItem(clave);
    }
}
