/**
 * data.js — Metadatos de las leyes disponibles en la biblioteca
 */

const LEYES_DATA = [
    {
        id: 'cpp',
        titulo: 'Código de Procedimiento Penal',
        subtitulo: 'Ley N° 1970',
        descripcion: 'Regula el procedimiento penal boliviano, estableciendo los principios, garantías y normas que rigen el proceso penal desde la investigación preliminar hasta la ejecución de la sentencia.',
        archivo: 'Leyes PDF/codigo-de-procedimiento-penal.pdf',
        icono: '⚖️',
        colorGradient: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 100%)',
        colorHex: '#e74c3c',
        tags: ['Proceso Penal', 'Investigación', 'Juicio Oral', 'Medidas Cautelares', 'Recursos'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: true
    },
    {
        id: 'cnna',
        titulo: 'Código Niña, Niño y Adolescente',
        subtitulo: 'Ley N° 548',
        descripcion: 'Establece el sistema de protección integral de niñas, niños y adolescentes en Bolivia, garantizando sus derechos fundamentales y definiendo las responsabilidades del Estado, la familia y la sociedad.',
        archivo: 'Leyes PDF/codigo-nina-nino-y-adolescente.pdf',
        icono: '👶',
        colorGradient: 'linear-gradient(135deg, #7b2d8b 0%, #9b59b6 100%)',
        colorHex: '#9b59b6',
        tags: ['Derechos del Niño', 'Protección', 'Familia', 'Adolescentes'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: false
    },
    {
        id: 'cp',
        titulo: 'Código Penal',
        subtitulo: 'Decreto Ley N° 10426',
        descripcion: 'Define los delitos y establece las penas aplicables en el ordenamiento jurídico boliviano. Es el cuerpo normativo fundamental del derecho penal sustantivo del Estado Plurinacional.',
        archivo: 'Leyes PDF/codigo-penal.pdf',
        icono: '🔒',
        colorGradient: 'linear-gradient(135deg, #1c2833 0%, #34495e 100%)',
        colorHex: '#526375',
        tags: ['Delitos', 'Penas', 'Tipo Penal', 'Responsabilidad', 'Bien Jurídico'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: true
    },
    {
        id: 'cpc',
        titulo: 'Código Procesal Constitucional',
        subtitulo: 'Ley N° 254',
        descripcion: 'Regula los procedimientos constitucionales: acción de amparo constitucional, acción de libertad, acción popular, acción de cumplimiento y acción de inconstitucionalidad.',
        archivo: 'Leyes PDF/codigo-procesal-constitucional.pdf',
        icono: '📜',
        colorGradient: 'linear-gradient(135deg, #1a6a9e 0%, #2980b9 100%)',
        colorHex: '#2980b9',
        tags: ['Acción de Amparo', 'Acción de Libertad', 'Constitucional', 'Garantías'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: false
    },
    {
        id: 'cpe',
        titulo: 'Constitución Política del Estado',
        subtitulo: 'Promulgada el 7 de febrero de 2009',
        descripcion: 'Ley suprema del Estado Plurinacional de Bolivia que establece los principios, valores, derechos, garantías fundamentales y la estructura orgánica del Estado boliviano.',
        archivo: 'Leyes PDF/constitucion-politica-del-estado.pdf',
        icono: '🏛️',
        colorGradient: 'linear-gradient(135deg, #b7950b 0%, #f0a500 100%)',
        colorHex: '#f0a500',
        tags: ['Derechos Fundamentales', 'Estado', 'Órganos del Estado', 'Garantías Constitucionales'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: true
    },
    {
        id: 'lflc',
        titulo: 'Ley de Lucha contra la Corrupción',
        subtitulo: 'Ley N° 974',
        descripcion: 'Establece mecanismos de fortalecimiento institucional para la prevención, detección, investigación y sanción de actos de corrupción en el sector público boliviano.',
        archivo: 'Leyes PDF/ley-de-fortalecimiento-para-la-lucha-contra-la-corrupcion.pdf',
        icono: '🛡️',
        colorGradient: 'linear-gradient(135deg, #0d6b5c 0%, #1abc9c 100%)',
        colorHex: '#1abc9c',
        tags: ['Corrupción', 'Transparencia', 'Sector Público', 'Sanciones', 'Enriquecimiento Ilícito'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: false
    },
    {
        id: 'ley348',
        titulo: 'Ley Integral Vida Libre de Violencia',
        subtitulo: 'Ley N° 348',
        descripcion: 'Garantiza a las mujeres una vida libre de violencia. Establece mecanismos, medidas y políticas integrales de prevención, atención, protección, persecución y sanción de la violencia contra las mujeres.',
        archivo: 'Leyes PDF/ley-integral-para-garantizar-a-las-mujeres-una-vida-libre-de-violencia-ley-348.pdf',
        icono: '💜',
        colorGradient: 'linear-gradient(135deg, #5b2c6f 0%, #8e44ad 100%)',
        colorHex: '#8e44ad',
        tags: ['Violencia de Género', 'Feminicidio', 'Protección', 'Mujeres', 'Derechos'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: false
    },
    {
        id: 'lomp',
        titulo: 'Ley Orgánica del Ministerio Público',
        subtitulo: 'Ley N° 260',
        descripcion: 'Regula la organización, atribuciones y funcionamiento del Ministerio Público como institución encargada de promover la acción penal pública y la defensa de la legalidad.',
        archivo: 'Leyes PDF/ley-organica-del-ministerio-publico.pdf',
        icono: '🏢',
        colorGradient: 'linear-gradient(135deg, #154360 0%, #1f6fa8 100%)',
        colorHex: '#1f6fa8',
        tags: ['Ministerio Público', 'Fiscales', 'Acción Penal', 'Organización Institucional'],
        tieneTitulos: true,
        tieneCapitulos: true,
        tienePartes: false
    }
];
