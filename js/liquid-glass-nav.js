(() => {
    const surfaceSelector = [
        '.sidebar__nav',
        '.config-card',
        '.ley-card',
        '.stats-bar',
        '.stat-item',
        '.pregunta-card',
        '.pregunta-fragmento',
        '.resultados-hero',
        '.revision-item',
        '.ley-option',
        '.lector-sidebar',
        '.lector-topbar',
        '.loading-card',
        '.announcements-dialog',
        '.install-help',
        '.message-bubble',
        '.conversation-item',
        '.conversation-header',
        '.quiz-ley-badge',
        '.person-result',
        '.libros-vacio',
        '.comunidad-codigo'
    ].join(',');
    const isChromium = /\b(?:chrome|chromium|crios|edg)\b/i.test(navigator.userAgent)
        && !/\b(?:firefox|fxios)\b/i.test(navigator.userAgent);
    const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(1px)');
    const settings = {
        depth: 4,
        blur: 2,
        strength: 40,
        chromaticAberration: 10
    };
    const filterCache = new Map();
    const mapCache = new Map();
    const pendingElements = new Set();
    let scheduledFrame = 0;
    let hoveredLink = null;

    function cacheValue(cache, key, createValue) {
        if (cache.has(key)) return cache.get(key);
        const value = createValue();
        cache.set(key, value);
        if (cache.size > 48) cache.delete(cache.keys().next().value);
        return value;
    }

    function createDisplacementMap(width, height, radius) {
        const key = `${width}x${height}:${radius}`;
        return cacheValue(mapCache, key, () => {
            const svg = `<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                <style>.mix { mix-blend-mode: screen; }</style>
                <defs>
                    <linearGradient id="Y" x1="0" x2="0" y1="${Math.ceil((radius / height) * 15)}%" y2="${Math.floor(100 - (radius / height) * 15)}%">
                        <stop offset="0%" stop-color="#0F0" />
                        <stop offset="100%" stop-color="#000" />
                    </linearGradient>
                    <linearGradient id="X" x1="${Math.ceil((radius / width) * 15)}%" x2="${Math.floor(100 - (radius / width) * 15)}%" y1="0" y2="0">
                        <stop offset="0%" stop-color="#F00" />
                        <stop offset="100%" stop-color="#000" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" height="${height}" width="${width}" fill="#808080" />
                <g filter="blur(2px)">
                    <rect x="0" y="0" height="${height}" width="${width}" fill="#000080" />
                    <rect x="0" y="0" height="${height}" width="${width}" fill="url(#Y)" class="mix" />
                    <rect x="0" y="0" height="${height}" width="${width}" fill="url(#X)" class="mix" />
                    <rect x="${settings.depth}" y="${settings.depth}" height="${height - 2 * settings.depth}" width="${width - 2 * settings.depth}" fill="#808080" rx="${radius}" ry="${radius}" filter="blur(${settings.depth}px)" />
                </g>
            </svg>`;

            return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        });
    }

    function createDisplacementFilter(width, height, radius) {
        const key = `${width}x${height}:${radius}`;
        return cacheValue(filterCache, key, () => {
            const map = createDisplacementMap(width, height, radius);
            const strength = settings.strength;
            const aberration = settings.chromaticAberration;
            const svg = `<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="displace" color-interpolation-filters="sRGB">
                        <feImage x="0" y="0" height="${height}" width="${width}" href="${map}" result="displacementMap" />
                        <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength + aberration * 2}" xChannelSelector="R" yChannelSelector="G" />
                        <feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedR" />
                        <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength + aberration}" xChannelSelector="R" yChannelSelector="G" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedG" />
                        <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength}" xChannelSelector="R" yChannelSelector="G" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="displacedB" />
                        <feBlend in="displacedR" in2="displacedG" mode="screen" />
                        <feBlend in2="displacedB" mode="screen" />
                    </filter>
                </defs>
            </svg>`;

            return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}#displace")`;
        });
    }

    function applyFilter(element) {
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const width = Math.max(50, Math.ceil(bounds.width));
        const height = Math.max(30, Math.ceil(bounds.height));
        const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 14;
        element.style.setProperty('--liquid-glass-filter', createDisplacementFilter(width, height, radius));
    }

    function scheduleFilter(element) {
        pendingElements.add(element);
        if (scheduledFrame) return;
        scheduledFrame = requestAnimationFrame(() => {
            scheduledFrame = 0;
            pendingElements.forEach(item => {
                if (item.isConnected) applyFilter(item);
            });
            pendingElements.clear();
        });
    }

    function registerSurface(element) {
        if (element.classList.contains('liquid-glass-surface')) return;
        element.classList.add('liquid-glass-surface');
        if (!isChromium || !supportsBackdropFilter) return;
        element.classList.add('liquid-glass-supported');
        if (intersectionObserver) intersectionObserver.observe(element);
        else scheduleFilter(element);
        resizeObserver?.observe(element);
        const bounds = element.getBoundingClientRect();
        if (bounds.width && bounds.height &&
            bounds.bottom >= -120 && bounds.top <= window.innerHeight + 120 &&
            bounds.right >= -120 && bounds.left <= window.innerWidth + 120) {
            applyFilter(element);
        }
    }

    function registerSubtree(root) {
        if (root instanceof Element && root.matches(surfaceSelector)) registerSurface(root);
        root.querySelectorAll?.(surfaceSelector).forEach(registerSurface);
    }

    function getNavLink(target) {
        return target instanceof Element ? target.closest('.sidebar__link') : null;
    }

    function setHoveredLink(link) {
        if (hoveredLink === link) return;
        hoveredLink?.classList.remove('liquid-glass-hover');
        hoveredLink = link;
        if (!hoveredLink) return;
        hoveredLink.classList.add('liquid-glass-hover');
        if (isChromium && supportsBackdropFilter) {
            hoveredLink.classList.add('liquid-glass-supported');
            scheduleFilter(hoveredLink);
        }
    }

    const intersectionObserver = isChromium && supportsBackdropFilter && window.IntersectionObserver
        ? new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                scheduleFilter(entry.target);
                intersectionObserver.unobserve(entry.target);
            });
        }, { rootMargin: '120px' })
        : null;

    const resizeObserver = isChromium && supportsBackdropFilter && window.ResizeObserver
        ? new ResizeObserver(entries => entries.forEach(entry => scheduleFilter(entry.target)))
        : null;

    registerSubtree(document);

    const mutationObserver = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(registerSubtree));
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    const nav = document.querySelector('.sidebar__nav');
    if (nav) {
        nav.addEventListener('pointerover', event => setHoveredLink(getNavLink(event.target)));
        nav.addEventListener('pointerout', event => setHoveredLink(getNavLink(event.relatedTarget)));
        nav.addEventListener('focusin', event => setHoveredLink(getNavLink(event.target)));
        nav.addEventListener('focusout', event => setHoveredLink(getNavLink(event.relatedTarget)));
    }

    window.addEventListener('resize', () => {
        document.querySelectorAll('.liquid-glass-surface').forEach(scheduleFilter);
    }, { passive: true });
})();
