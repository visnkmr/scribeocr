import { enableDisableFontOpt, setDefaultFontAuto } from './fontContainerMain.js';
// import { calcFontMetricsAll } from './fontStatistics.js';
import { optimizeFontContainerAll, fontAll } from './containers/fontContainer.js';
import { fontMetricsObj } from './containers/miscContainer.js';
// import { replaceObjectProperties } from './miscUtils.js';

/**
 *
 * @param {FontContainerFamily} font
 * @param {Array<OcrPage>} pageArr
 * @param {Array<ImageBitmap>} binaryImageArr
 * @param {Array<boolean>} binaryRotatedArr
 * @param {number} n - Number of words to compare
 */
export async function evalPageFonts(font, pageArr, binaryImageArr, binaryRotatedArr, n = 500) {
  const browserMode = typeof process === 'undefined';

  let metricTotal = 0;
  let wordsTotal = 0;

  for (let i = 0; i < pageArr.length; i++) {
    if (wordsTotal > n) break;

    // The Node.js canvas package does not currently support worke threads
    // https://github.com/Automattic/node-canvas/issues/1394
    let res;
    if (!browserMode) {
      const { evalPageFont } = await import('./worker/compareOCRModule.js');

      res = await evalPageFont({
        font: font.normal.family, page: pageArr[i], binaryImage: binaryImageArr[i], imageRotated: binaryRotatedArr[i], pageMetricsObj: globalThis.pageMetricsArr[i],
      });
      // Browser case
    } else {
      res = await globalThis.gs.evalPageFont({
        font: font.normal.family, page: pageArr[i], binaryImage: binaryImageArr[i], imageRotated: binaryRotatedArr[i], pageMetricsObj: globalThis.pageMetricsArr[i],
      });
    }

    metricTotal += res.metricTotal;
    wordsTotal += res.wordsTotal;
  }

  return metricTotal;
}

/**
* @param {Array<OcrPage>} pageArr
* @param {Array<Promise<ImageBitmap>>} binaryImageArr
* @param {Array<boolean>} binaryRotatedArr
*/
export async function evaluateFonts(pageArr, binaryImageArr, binaryRotatedArr) {
  const fontActive = fontAll.get('active');

  const debug = false;

  const binaryImageArrRes = await Promise.all(binaryImageArr);

  const sansMetrics = {
    Carlito: await evalPageFonts(fontActive.Carlito, pageArr, binaryImageArrRes, binaryRotatedArr),
    NimbusSans: await evalPageFonts(fontActive.NimbusSans, pageArr, binaryImageArrRes, binaryRotatedArr),
  };

  let minKeySans = 'NimbusSans';
  let minValueSans = Number.MAX_VALUE;

  for (const [key, value] of Object.entries(sansMetrics)) {
    if (debug) console.log(`${key} metric: ${String(value)}`);
    if (value < minValueSans) {
      minValueSans = value;
      minKeySans = key;
    }
  }

  const serifMetrics = {
    Century: await evalPageFonts(fontActive.Century, pageArr, binaryImageArrRes, binaryRotatedArr),
    Palatino: await evalPageFonts(fontActive.Palatino, pageArr, binaryImageArrRes, binaryRotatedArr),
    Garamond: await evalPageFonts(fontActive.Garamond, pageArr, binaryImageArrRes, binaryRotatedArr),
    NimbusRomNo9L: await evalPageFonts(fontActive.NimbusRomNo9L, pageArr, binaryImageArrRes, binaryRotatedArr),
  };

  let minKeySerif = 'NimbusRomNo9L';
  let minValueSerif = Number.MAX_VALUE;

  for (const [key, value] of Object.entries(serifMetrics)) {
    if (debug) console.log(`${key} metric: ${String(value)}`);
    if (value < minValueSerif) {
      minValueSerif = value;
      minKeySerif = key;
    }
  }

  return {
    sansMetrics,
    serifMetrics,
    minKeySans,
    minKeySerif,
  };
}

/**
 * Runs font optimization and validation. Sets `fontAll` defaults to best fonts,
 * and returns `true` if sans or serif could be improved through optimization.
 *
 * @param {Array<OcrPage>} ocrArr - Array of OCR pages to use for font optimization.
 * @param {?Array<Promise<ImageBitmap>>} imageArr - Array of binary images to use for validating optimized fonts.
 * @param {?Array<boolean>} imageRotatedArr - Array of booleans indicating whether each image in `imageArr` has been rotated.
 *
 * This function should still be run, even if no character-level OCR data is present,
 * as it is responsible for picking the correct default sans/serif font.
 * The only case where this function does nothing is when (1) there is no character-level OCR data
 * and (2) no images are provided to compare against.
 */
export async function runFontOptimization(ocrArr, imageArr, imageRotatedArr) {
  const browserMode = typeof process === 'undefined';

  const fontRaw = fontAll.get('raw');

  const calculateOpt = fontMetricsObj && Object.keys(fontMetricsObj).length > 0;

  let enableOpt = false;

  if (calculateOpt) {
    setDefaultFontAuto(fontMetricsObj);
    fontAll.opt = await optimizeFontContainerAll(fontRaw, fontMetricsObj);
  }

  // If image data exists, select the correct font by comparing to the image.
  if (imageArr && imageRotatedArr && imageArr[0]) {
    // Evaluate default fonts using up to 5 pages.
    const pageNum = Math.min(imageArr.length, 5);

    // Set raw font in workers
    await enableDisableFontOpt(false);

    // This step needs to happen here as all fonts must be registered before initializing the canvas.
    if (!browserMode) {
      const { initCanvasNode } = await import('./worker/compareOCRModule.js');
      await initCanvasNode();
    }

    const evalRaw = await evaluateFonts(ocrArr.slice(0, pageNum), imageArr.slice(0, pageNum),
      imageRotatedArr.slice(0, pageNum));

    if (calculateOpt && fontAll.opt) {
      // Enable optimized fonts
      await enableDisableFontOpt(true);

      const evalOpt = await evaluateFonts(ocrArr.slice(0, pageNum), imageArr.slice(0, pageNum),
        imageRotatedArr.slice(0, pageNum));

      fontAll.opt.SansDefault = fontAll.opt[evalOpt.minKeySans];
      fontAll.opt.SerifDefault = fontAll.opt[evalOpt.minKeySerif];

      // The default font for both the optimized and unoptimized versions are set to the same font.
      // This ensures that switching on/off "font optimization" does not change the font, which would be confusing.
      if (evalOpt.sansMetrics[evalOpt.minKeySans] < evalRaw.sansMetrics[evalRaw.minKeySans]) {
        fontAll.sansDefaultName = evalOpt.minKeySans;
        fontRaw.SansDefault = fontRaw[evalOpt.minKeySans];
        fontAll.opt.SansDefault = fontAll.opt[evalOpt.minKeySans];
        enableOpt = true;
      } else {
        fontAll.sansDefaultName = evalRaw.minKeySans;
        fontRaw.SansDefault = fontRaw[evalRaw.minKeySans];
        fontAll.opt.SansDefault = fontAll.opt[evalRaw.minKeySans];

        // Delete optimized fonts by overwriting with non-optimized fonts.
        // This should be made dynamic at some point rather than hard-coding font names.
        fontAll.opt.Carlito = fontRaw.Carlito;
        fontAll.opt.NimbusSans = fontRaw.NimbusSans;
        fontAll.opt.SansDefault = fontRaw.SansDefault;
      }

      // Repeat for serif fonts
      if (evalOpt.serifMetrics[evalOpt.minKeySerif] < evalRaw.serifMetrics[evalRaw.minKeySerif]) {
        fontAll.serifDefaultName = evalOpt.minKeySerif;
        fontRaw.SerifDefault = fontRaw[evalOpt.minKeySerif];
        fontAll.opt.SerifDefault = fontAll.opt[evalOpt.minKeySerif];
        enableOpt = true;
      } else {
        fontAll.serifDefaultName = evalRaw.minKeySerif;
        fontRaw.SerifDefault = fontRaw[evalRaw.minKeySerif];
        fontAll.opt.SerifDefault = fontAll.opt[evalRaw.minKeySerif];

        fontAll.opt.Century = fontRaw.Century;
        fontAll.opt.Garamond = fontRaw.Garamond;
        fontAll.opt.NimbusRomNo9L = fontRaw.NimbusRomNo9L;
        fontAll.opt.Palatino = fontRaw.Palatino;
        fontAll.opt.SerifDefault = fontRaw.SerifDefault;
      }
    } else {
      fontAll.sansDefaultName = evalRaw.minKeySans;
      fontAll.serifDefaultName = evalRaw.minKeySerif;
      fontRaw.SansDefault = fontRaw[evalRaw.minKeySans];
      fontRaw.SerifDefault = fontRaw[evalRaw.minKeySerif];
    }
  }

  // Set final fonts in workers
  await enableDisableFontOpt(true);

  return enableOpt;
}
