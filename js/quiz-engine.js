/**
 * quiz-engine.js — Motor de generación de preguntas aleatorias
 * a partir de artículos de leyes bolivianas.
 *
 * Tipos de pregunta:
 *  - opcion-multiple   ¿Qué establece el Artículo X?
 *  - identificar       ¿A qué artículo pertenece este texto?
 *  - verdadero-falso   ¿Este enunciado sobre el Art. X es correcto?
 *  - completar         Complete el texto del Artículo X: [________]
 */

class QuizEngine {

    /**
     * Genera un array de preguntas.
     * @param {Array}  articulos - Artículos del rango filtrado
     * @param {Object} config    - { cantidad, tipos[] }
     * @returns {Array} Preguntas generadas
     */
    generarQuiz(articulos, config) {
        const { cantidad, tipos } = config;

        // Solo artículos con contenido útil
        const validos = articulos.filter(a =>
            a.contenido && a.contenido.replace(/\s+/g, ' ').trim().length > 35
        );

        if (validos.length < 2) {
            throw new Error(
                `Solo se encontraron ${validos.length} artículos con contenido en el rango seleccionado.\n` +
                'Intenta ampliar el rango o seleccionar otro tipo de rango.'
            );
        }

        const totalPreguntas = Math.min(cantidad, validos.length);
        const seleccionados = this._aleatorio(validos, totalPreguntas);
        const preguntas = [];

        for (const articulo of seleccionados) {
            // Filtrar tipos aplicables a este artículo
            const tiposAplicables = tipos.filter(t => {
                if (t === 'completar') {
                    const palabras = articulo.contenido.trim().split(/\s+/);
                    return palabras.length >= 10; // Necesita suficientes palabras
                }
                if (t === 'identificar') {
                    return validos.length >= 4; // Necesita mínimo 4 opciones
                }
                return true;
            });

            const tipo = tiposAplicables.length > 0
                ? tiposAplicables[Math.floor(Math.random() * tiposAplicables.length)]
                : 'opcion-multiple';

            let pregunta = null;
            try {
                switch (tipo) {
                    case 'opcion-multiple': pregunta = this._opcionMultiple(articulo, validos); break;
                    case 'identificar':    pregunta = this._identificar(articulo, validos);    break;
                    case 'verdadero-falso':pregunta = this._verdaderoFalso(articulo, validos); break;
                    case 'completar':      pregunta = this._completar(articulo, validos);      break;
                }
            } catch (e) {
                pregunta = this._opcionMultiple(articulo, validos);
            }

            if (pregunta) preguntas.push(pregunta);
        }

        return preguntas.filter(p => p !== null);
    }

    generarQuizLectura(fragmentos, config, titulos = []) {
        const validos = fragmentos.filter(fragmento =>
            fragmento.contenido && fragmento.contenido.replace(/\s+/g, ' ').trim().length > 80
        );
        if (validos.length < 2) {
            throw new Error('No se pudo extraer suficiente texto del libro para generar preguntas. Comprueba que el PDF tenga texto seleccionable.');
        }

        const titulosDetectados = [...new Set([
            ...titulos,
            ...validos.map(fragmento => fragmento.titulo).filter(Boolean)
        ])];
        const tiposSolicitados = [...new Set(config.tipos)]
            .filter(tipo => ['comprension', 'verdadero-falso', 'completar', 'titulos'].includes(tipo));
        const tiposDisponibles = tiposSolicitados.filter(tipo => tipo !== 'titulos' || titulosDetectados.length > 1);
        const tipos = tiposDisponibles.length ? tiposDisponibles : ['comprension'];
        const cantidad = Math.min(config.cantidad, validos.length);
        const plan = [];

        while (plan.length < cantidad) {
            plan.push(...this._mezclar(tipos));
        }
        plan.length = cantidad;

        const pendientes = this._aleatorio(validos, validos.length);
        const preguntas = [];
        for (const tipo of plan) {
            let indice = tipo === 'titulos'
                ? pendientes.findIndex(fragmento => fragmento.titulo && titulosDetectados.includes(fragmento.titulo))
                : -1;
            if (indice < 0) indice = 0;
            const [fragmento] = pendientes.splice(indice, 1);
            let pregunta;

            if (tipo === 'titulos' && fragmento.titulo && titulosDetectados.length > 1) {
                pregunta = this._preguntaTitulo(fragmento, titulosDetectados);
            } else if (tipo === 'verdadero-falso') {
                pregunta = this._preguntaLecturaVF(fragmento, validos);
            } else if (tipo === 'completar') {
                pregunta = this._preguntaLecturaCompletar(fragmento, validos);
            } else {
                pregunta = this._preguntaComprension(fragmento, validos);
            }
            preguntas.push(pregunta);
        }
        return preguntas;
    }

    _preguntaComprension(fragmento, todos) {
        const textoCorrecto = this._fraseClave(fragmento.contenido);
        const correcta = this._htmlSeguro(textoCorrecto);
        const distractores = this._aleatorio([...new Set(
            todos
                .filter(item => item.numero !== fragmento.numero)
                .map(item => this._fraseClave(item.contenido))
                .filter(texto => texto && texto !== textoCorrecto)
        )], 3).map(item => this._htmlSeguro(item));
        const opciones = this._mezclar([correcta, ...distractores]);
        const preguntas = [
            'Según el fragmento, ¿qué idea se expresa?',
            '¿Cuál afirmación está respaldada por el texto mostrado?',
            '¿Qué se puede concluir a partir de este pasaje?',
            '¿Qué idea resume mejor la información del fragmento?'
        ];
        return {
            id: this._uid(),
            tipo: 'comprension',
            tipoLabel: 'Comprensión de ideas',
            tipoColor: '#3b82f6',
            pregunta: preguntas[Math.floor(Math.random() * preguntas.length)],
            fragmento: this._htmlSeguro(this._recortarFragmento(fragmento.contenido)),
            opciones,
            respuestaCorrecta: correcta,
            contexto: this._contextoLectura(fragmento),
            explicacion: `La opción correcta aparece en el fragmento mostrado:\n\n"${this._htmlSeguro(fragmento.contenido)}"`,
            contenidoCompleto: fragmento.contenido
        };
    }

    _preguntaTitulo(fragmento, titulos) {
        const correcta = this._htmlSeguro(fragmento.titulo);
        const distractores = this._aleatorio(
            titulos.filter(titulo => titulo !== fragmento.titulo),
            Math.min(3, titulos.length - 1)
        ).map(titulo => this._htmlSeguro(titulo));
        const opciones = this._mezclar([correcta, ...distractores]);
        return {
            id: this._uid(),
            tipo: 'titulos',
            tipoLabel: 'Relacionar con el título',
            tipoColor: '#8b5cf6',
            pregunta: '¿Qué título o encabezado corresponde al fragmento?',
            fragmento: this._htmlSeguro(this._recortarFragmento(fragmento.contenido)),
            opciones,
            respuestaCorrecta: correcta,
            contexto: 'Identifica el apartado por su contenido',
            explicacion: `El encabezado detectado antes de este texto es "${correcta}".\n\nFragmento:\n"${this._htmlSeguro(fragmento.contenido)}"`,
            contenidoCompleto: fragmento.contenido
        };
    }

    _preguntaLecturaVF(fragmento, todos) {
        const esVerdadero = Math.random() < 0.5;
        const otro = this._aleatorio(
            todos.filter(item => item.numero !== fragmento.numero),
            1
        )[0];
        if (!otro) return this._preguntaComprension(fragmento, todos);
        const afirmacion = this._htmlSeguro(esVerdadero
            ? this._fraseClave(fragmento.contenido)
            : this._fraseClave(otro.contenido));
        return {
            id: this._uid(),
            tipo: 'verdadero-falso',
            tipoLabel: 'Verdadero o Falso',
            tipoColor: '#f59e0b',
            pregunta: '¿Esta afirmación se puede comprobar en el fragmento mostrado?',
            fragmento: this._htmlSeguro(this._recortarFragmento(fragmento.contenido)),
            enunciado: `“${afirmacion}”`,
            opciones: this._mezclar(['Verdadero', 'Falso']),
            respuestaCorrecta: esVerdadero ? 'Verdadero' : 'Falso',
            contexto: this._contextoLectura(fragmento),
            explicacion: `El fragmento analizado dice:\n\n"${this._htmlSeguro(fragmento.contenido)}"`,
            contenidoCompleto: fragmento.contenido
        };
    }

    _preguntaLecturaCompletar(fragmento, todos) {
        const palabras = fragmento.contenido.match(/\b[\p{L}]{5,}\b/gu) || [];
        const palabra = palabras[Math.floor(palabras.length / 2)];
        if (!palabra) return this._preguntaComprension(fragmento, todos);

        const escaped = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const textoConEspacio = this._htmlSeguro(fragmento.contenido)
            .replace(new RegExp(`(^|[^\\p{L}])(${escaped})(?=$|[^\\p{L}])`, 'iu'), '$1________');
        const distractores = todos
            .filter(item => item.numero !== fragmento.numero)
            .flatMap(item => item.contenido.match(/\b[\p{L}]{5,}\b/gu) || [])
            .filter(item => item.toLowerCase() !== palabra.toLowerCase());
        const opciones = this._mezclar([
            this._htmlSeguro(palabra),
            ...this._aleatorio([...new Set(distractores)], Math.min(3, new Set(distractores).size)).map(item => this._htmlSeguro(item))
        ]);
        return {
            id: this._uid(),
            tipo: 'completar',
            tipoLabel: 'Completar el texto',
            tipoColor: '#22c55e',
            pregunta: 'Completa la palabra que falta en el fragmento:',
            enunciado: textoConEspacio,
            opciones,
            respuestaCorrecta: palabra,
            contexto: this._contextoLectura(fragmento),
            explicacion: `La palabra correcta es "${this._htmlSeguro(palabra)}".\n\nFragmento completo:\n"${this._htmlSeguro(fragmento.contenido)}"`,
            contenidoCompleto: fragmento.contenido
        };
    }

    _fraseClave(texto) {
        const frases = texto
            .replace(/\s+/g, ' ')
            .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [texto];
        const frase = frases
            .map(item => item.trim())
            .filter(item => item.length >= 35)
            .sort((a, b) => b.length - a.length)[0] || texto.trim();
        return this._resumir(frase, 210);
    }

    _recortarFragmento(texto, max = 440) {
        const limpio = texto.replace(/\s+/g, ' ').trim();
        if (limpio.length <= max) return limpio;
        const cortado = limpio.slice(0, max);
        const ultimoEspacio = cortado.lastIndexOf(' ');
        return `${cortado.slice(0, ultimoEspacio > max * 0.7 ? ultimoEspacio : max)}…`;
    }

    _contextoLectura(fragmento) {
        const titulo = fragmento.titulo ? this._htmlSeguro(fragmento.titulo) : '';
        return titulo
            ? `Apartado: ${titulo} · Fragmento ${fragmento.numero}`
            : `Fragmento ${fragmento.numero}`;
    }

    // ─────────────────────────────────────────────
    //  GENERADORES DE TIPOS DE PREGUNTA
    // ─────────────────────────────────────────────

    /** Opción múltiple: ¿Qué establece el Artículo X? */
    _opcionMultiple(articulo, todos) {
        const otros = todos.filter(a => a.numero !== articulo.numero && a.contenido.length > 35);
        if (otros.length < 3) return null;

        const distractores = this._aleatorio(otros, 3);
        const correcta = this._resumir(articulo.contenido, 280);

        const opciones = this._mezclar([
            { texto: correcta, esCorrecta: true },
            ...distractores.map(d => ({ texto: this._resumir(d.contenido, 280), esCorrecta: false }))
        ]);

        return {
            id: this._uid(),
            tipo: 'opcion-multiple',
            tipoLabel: 'Opción Múltiple',
            tipoColor: '#3b82f6',
            pregunta: `¿Qué establece el <strong>Artículo ${articulo.numero}</strong>?`,
            opciones: opciones.map(o => o.texto),
            respuestaCorrecta: correcta,
            articuloRef: articulo.numero,
            contexto: this._contexto(articulo),
            explicacion: `El <strong>Artículo ${articulo.numero}</strong> establece:\n\n"${articulo.contenido}"`,
            contenidoCompleto: articulo.contenido
        };
    }

    /** Identificar artículo: ¿A qué artículo pertenece este texto? */
    _identificar(articulo, todos) {
        const otros = todos.filter(a => a.numero !== articulo.numero);
        if (otros.length < 3) return null;

        const distractores = this._aleatorio(otros, 3);
        const fragmento = this._fragmento(articulo.contenido);
        const correctaTexto = `Artículo ${articulo.numero}`;

        const opciones = this._mezclar([
            correctaTexto,
            ...distractores.map(d => `Artículo ${d.numero}`)
        ]);

        return {
            id: this._uid(),
            tipo: 'identificar',
            tipoLabel: 'Identificar Artículo',
            tipoColor: '#8b5cf6',
            pregunta: '¿A qué artículo corresponde el siguiente texto?',
            fragmento: `"${fragmento}"`,
            opciones: opciones,
            respuestaCorrecta: correctaTexto,
            articuloRef: articulo.numero,
            contexto: this._contexto(articulo),
            explicacion: `Este texto pertenece al <strong>Artículo ${articulo.numero}</strong>.\n\nTexto completo: "${articulo.contenido}"`,
            contenidoCompleto: articulo.contenido
        };
    }

    /** Verdadero o Falso: ¿Este enunciado sobre el Art. X es correcto? */
    _verdaderoFalso(articulo, todos) {
        const esVerdadero = Math.random() > 0.45;
        let enunciado;

        if (esVerdadero) {
            enunciado = `"${this._resumir(articulo.contenido, 220)}"`;
        } else {
            const otro = this._aleatorio(
                todos.filter(a => a.numero !== articulo.numero && a.contenido.length > 35),
                1
            )[0];
            if (!otro) return this._opcionMultiple(articulo, todos);
            enunciado = `"${this._resumir(otro.contenido, 220)}"`;
        }

        return {
            id: this._uid(),
            tipo: 'verdadero-falso',
            tipoLabel: 'Verdadero o Falso',
            tipoColor: '#f59e0b',
            pregunta: `¿El siguiente texto corresponde a lo que establece el <strong>Artículo ${articulo.numero}</strong>?`,
            enunciado: enunciado,
            opciones: ['Verdadero', 'Falso'],
            respuestaCorrecta: esVerdadero ? 'Verdadero' : 'Falso',
            articuloRef: articulo.numero,
            contexto: this._contexto(articulo),
            explicacion: `El enunciado es <strong>${esVerdadero ? 'VERDADERO' : 'FALSO'}</strong>.\n\nEl Artículo ${articulo.numero} establece:\n"${articulo.contenido}"`,
            contenidoCompleto: articulo.contenido
        };
    }

    /** Completar: Complete el texto del Artículo X con [________] */
    _completar(articulo, todos) {
        // Palabras comunes en español a ignorar
        const STOP_WORDS = new Set([
            'el','la','los','las','de','del','en','con','por','para','que','se','al',
            'es','un','una','su','sus','no','lo','le','les','y','o','a','e','ni','u',
            'si','ya','más','sin','ante','bajo','como','sobre','entre','hasta','desde',
            'mediante','durante','según','siendo','dicho','este','esta','estos','estas',
            'aquel','aquella','cuyo','cuya','cuyas','cuyos','cual','cuales','quien',
            'quienes','toda','todo','todos','todas','cada','será','serán','será',
            'podrá','deberá','tendrá','cuando','donde','mientras','aunque'
        ]);

        const palabras = articulo.contenido.split(/\s+/);
        if (palabras.length < 10) return null;

        // Candidatos: palabras significativas (>4 letras, no stop words)
        const candidatos = palabras
            .map((p, i) => ({ p, i, limpia: p.replace(/[,\.;\:()"\'\-]/g, '').toLowerCase() }))
            .filter(({ limpia, i }) =>
                limpia.length >= 5 &&
                !STOP_WORDS.has(limpia) &&
                i > 1 && i < palabras.length - 1
            );

        if (candidatos.length === 0) return null;

        // Elegir palabra del tercio central del artículo para mayor dificultad
        const inicio = Math.floor(candidatos.length * 0.2);
        const fin = Math.floor(candidatos.length * 0.8);
        const rango = candidatos.slice(inicio, fin + 1);
        if (rango.length === 0) return null;

        const elegido = rango[Math.floor(Math.random() * rango.length)];
        const palabraCorrecta = elegido.limpia;

        // Reemplazar la primera ocurrencia en el contenido
        const regex = new RegExp('\\b' + palabraCorrecta + '\\b', 'i');
        const contenidoConBlanco = articulo.contenido.replace(regex, '<span class="blank">[___________]</span>');

        // Si no se pudo reemplazar, salir
        if (!contenidoConBlanco.includes('blank')) return null;

        // Distractores: palabras significativas de otros artículos
        const palabrasOtros = todos
            .filter(a => a.numero !== articulo.numero)
            .flatMap(a => a.contenido.split(/\s+/).map(p => p.replace(/[,\.;\:()"\'\-]/g, '').toLowerCase()))
            .filter(p => p.length >= 5 && !STOP_WORDS.has(p) && p !== palabraCorrecta);

        const conjuntoDistractores = [...new Set(palabrasOtros)];
        const distractores = this._aleatorio(conjuntoDistractores, 3);
        if (distractores.length < 3) return null;

        const opciones = this._mezclar([palabraCorrecta, ...distractores]);

        return {
            id: this._uid(),
            tipo: 'completar',
            tipoLabel: 'Completar Texto',
            tipoColor: '#22c55e',
            pregunta: `Complete el texto del <strong>Artículo ${articulo.numero}</strong>:`,
            enunciado: contenidoConBlanco,
            opciones: opciones,
            respuestaCorrecta: palabraCorrecta,
            articuloRef: articulo.numero,
            contexto: this._contexto(articulo),
            explicacion: `La palabra correcta es <strong>"${palabraCorrecta}"</strong>.\n\nEl Artículo ${articulo.numero} completo:\n"${articulo.contenido}"`,
            contenidoCompleto: articulo.contenido
        };
    }

    // ─────────────────────────────────────────────
    //  UTILIDADES
    // ─────────────────────────────────────────────

    _contexto(articulo) {
        const partes = [];
        if (articulo.parte) partes.push(articulo.parte);
        if (articulo.titulo) partes.push(articulo.titulo);
        if (articulo.capitulo) partes.push(articulo.capitulo);
        return partes.join(' › ');
    }

    _resumir(texto, max = 200) {
        const limpio = texto.replace(/\s+/g, ' ').trim();
        if (limpio.length <= max) return limpio;
        // Cortar en el último espacio antes del límite
        const cortado = limpio.substring(0, max);
        const ultimoEspacio = cortado.lastIndexOf(' ');
        return (ultimoEspacio > max * 0.7 ? cortado.substring(0, ultimoEspacio) : cortado) + '...';
    }

    _fragmento(texto) {
        const limpio = texto.replace(/\s+/g, ' ').trim();
        const max = 180;
        if (limpio.length <= max) return limpio;

        // Elegir un punto de inicio aleatorio, no muy al principio ni al final
        const rangoInicio = Math.floor(limpio.length * 0.15);
        const rangoFin = Math.max(rangoInicio, limpio.length - max - 20);
        const inicio = rangoInicio + Math.floor(Math.random() * (rangoFin - rangoInicio));

        let fragmento = limpio.substring(inicio, inicio + max).trim();

        // Limpiar inicio del fragmento (quitar palabra a medias)
        const primerEsp = fragmento.indexOf(' ');
        if (primerEsp > 0 && primerEsp < 20) {
            fragmento = fragmento.substring(primerEsp + 1);
        }

        return '...' + fragmento + (limpio.length > inicio + max ? '...' : '');
    }

    _aleatorio(arr, n) {
        const copia = [...arr];
        const res = [];
        for (let i = 0; i < n && copia.length > 0; i++) {
            const idx = Math.floor(Math.random() * copia.length);
            res.push(copia.splice(idx, 1)[0]);
        }
        return res;
    }

    _mezclar(arr) {
        const c = [...arr];
        for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [c[i], c[j]] = [c[j], c[i]];
        }
        return c;
    }

    _uid() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    _htmlSeguro(texto) {
        return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
}
