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
}
