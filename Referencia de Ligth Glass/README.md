# Liquid Glass Web Component (Vanilla JavaScript)

This is a small **Vanilla JavaScript Web Component** that simulates a **Liquid Glass** distortion effect.  
It includes several configuration options such as depth, chromatic aberration, size, shape, and other parameters inspired by how the effect behaves in real life. It is not perfect, but it aims to get reasonably close.

One nice thing about this component is that it’s written in plain Web Component standards, so you can use it in any environment, frameworks, no frameworks, anywhere you need it.

The component also includes a simple fallback for browsers that don’t support the technologies used (mainly SVG Filters), so it degrades gracefully instead of breaking.

## Background

This work is based on a React component I found in an article.  
https://medium.com/ekino-france/liquid-glass-in-css-and-svg-839985fcb88d

What I did was mainly translate that idea into a Vanilla Web Component, and then added some small improvements, configuration options, and a more flexible structure.  
It’s simply meant to be a small contribution for whoever finds it useful.

## Usage

Include the two JavaScript files and the component's stylesheet in the page. The component then uses the SVG displacement filter and the `backdrop-filter` to distort the content behind it.

```html
<link rel="stylesheet" href="styles.css">

<main class="hero">
    <glass-element
        class="glass-control"
        auto-size
        radius="14"
        depth="10"
        blur="2"
        strength="100"
        chromatic-aberration="8"
        background-color="rgba(255, 255, 255, 0.18)"
        min-width="180"
        min-height="56">
        <button class="glass-button" type="button">hello word</button>
    </glass-element>
</main>

<script src="displacement-utils.js"></script>
<script src="glass-element.js"></script>
```

For a fixed-size element, omit `auto-size` and provide `width` and `height`:

```html
<glass-element
    width="48"
    height="48"
    radius="24"
    depth="5"
    blur="1"
    strength="40"
    background-color="rgba(255,255,255,0.4)"
    chromatic-aberration="2">
    ⭐
</glass-element>
```

## Attributes

- `width` and `height`: fixed dimensions in pixels.
- `auto-size`: calculates the dimensions from the slotted content.
- `min-width` and `min-height`: minimum dimensions when using `auto-size`.
- `radius`: corner radius in pixels.
- `depth`: displacement depth in pixels.
- `blur`: backdrop blur intensity.
- `strength`: intensity of the displacement effect.
- `chromatic-aberration`: adds separation between the red, green, and blue channels.
- `background-color`: color and transparency of the glass surface.
- `debug`: set to `true` to display the displacement map instead of the final effect.
- `responsive`: scales fixed dimensions proportionally to the viewport.
- `base-width` and `base-height`: dimensions used as the reference for `responsive`.

The component supports pointer dragging, including mouse and touch input. Hold and move the element to reposition it anywhere inside the viewport. The displacement effect becomes slightly stronger while held and returns to the configured strength after release.

## Demo styles

`styles.css` provides the full-page background and the visual appearance of the example button. The `.glass-control` class also disables text selection and prevents browser touch gestures from interfering with dragging.
