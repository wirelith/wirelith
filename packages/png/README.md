# @wirelith/png

PNG output for Wirelith. It rasterises the SVG that `@wirelith/core` renders, using only the fonts bundled with it (Inter, Source Serif 4 and JetBrains Mono), so the result doesn't depend on the fonts installed on a machine. A PNG can carry its Wirelith source in an `iTXt` chunk with the keyword `wirelith-source`.

**Status: 0.x, unstable, not yet published.**

```js
import { render } from '@wirelith/core';
import { extractPngSource, svgToPng } from '@wirelith/png';

const { svg } = render(source);
const png = svgToPng(svg, { scale: 2, source });
extractPngSource(png); // the source again
```

It uses the resvg-js rasteriser (MPL-2.0). It makes no network requests and runs no browser.

MIT licensed. The bundled fonts are under the SIL Open Font License 1.1; see [NOTICE](../../NOTICE).
