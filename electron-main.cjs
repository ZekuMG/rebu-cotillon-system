const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let supplierImageLoginWindow;

const APP_NAME = 'Rebu Cotillon System';
const isDev = !app.isPackaged;
const SUPPLIER_IMAGE_PARTITION = 'persist:rebu-casa-alberto-images';
const SUPPLIER_LOGIN_URL = 'http://cotilloncasaalberto.com.ar/pedido/login.php';
const SUPPLIER_DEFAULT_ORIGIN = 'http://cotilloncasaalberto.com.ar';
const SUPPLIER_RESTRICTED_PATH = '/pedido/index_restringido.php';
const OPENAI_IMAGE_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';

const readEnvFileValue = (key) => {
  const candidateFiles = [
    path.join(app.getAppPath(), '.env.local'),
    path.join(app.getAppPath(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
  ];

  for (const filePath of candidateFiles) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'));
      if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, '');
    } catch {
      // La variable de entorno sigue siendo la fuente principal.
    }
  }
  return '';
};

const getOpenAIApiKey = () =>
  String(process.env.OPENAI_API_KEY || readEnvFileValue('OPENAI_API_KEY') || '').trim();

const decodeImageInput = async (source) => {
  const rawSource = String(source || '').trim();
  if (!rawSource) throw new Error('No se recibio una imagen para editar.');

  if (rawSource.startsWith('data:image/')) {
    const match = rawSource.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error('La imagen base64 no tiene un formato valido.');
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType: match[1],
      fileName: `rebu-product.${match[1].includes('png') ? 'png' : match[1].includes('webp') ? 'webp' : 'jpg'}`,
    };
  }

  const parsedUrl = new URL(rawSource);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('La URL de imagen no esta permitida.');
  }

  const response = await fetch(parsedUrl.href);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen original (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType.split(';')[0] || 'image/jpeg',
    fileName: `rebu-product.${contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'}`,
  };
};

const editImageWithOpenAI = async ({
  imageUrl,
  logoImageUrl = '',
  logoInstruction = '',
  referenceImages = [],
  prompt,
  productTitle = '',
} = {}) => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return {
      success: false,
      error: 'Falta OPENAI_API_KEY. Configurala como variable de entorno o en .env.local.',
    };
  }

  const safePrompt = String(prompt || '').trim();
  if (safePrompt.length < 12) {
    return { success: false, error: 'El prompt es demasiado corto para editar la foto.' };
  }

  const imageInput = await decodeImageInput(imageUrl);
  const logoInput = logoImageUrl ? await decodeImageInput(logoImageUrl) : null;
  const safeReferenceImages = Array.isArray(referenceImages)
    ? referenceImages.slice(0, 6).filter((item) => item?.imageUrl)
    : [];
  const decodedReferences = [];
  for (const [index, reference] of safeReferenceImages.entries()) {
    const input = await decodeImageInput(reference.imageUrl);
    decodedReferences.push({
      ...reference,
      input,
      imageNumber: 2 + (logoInput ? 1 : 0) + index,
    });
  }
  const finalPrompt = [
    'Input images:',
    '- Image 1 is the product photo to edit.',
    logoInput
      ? '- Image 2 is the brand logo/reference image. Treat it only as the Rebu logo, not as another product.'
      : '',
    ...decodedReferences.map((reference) => (
      `- Image ${reference.imageNumber} is an extra reference. Role: ${String(reference.role || 'reference').trim()}. ${String(reference.instruction || '').trim()}`
    )),
    '',
    safePrompt,
    logoInput && logoInstruction
      ? `Logo instruction: ${String(logoInstruction || '').trim()}`
      : '',
    decodedReferences.length > 0
      ? [
          'Extra image instructions:',
          ...decodedReferences.map((reference) => (
            `Image ${reference.imageNumber} (${String(reference.name || reference.role || 'reference').trim()}): ${String(reference.instruction || 'Use only as visual reference.').trim()}`
          )),
        ].join('\n')
      : '',
    '',
    `Producto de Rebu Cotillon: ${String(productTitle || 'producto de cotillon').slice(0, 140)}`,
    'Preservar el producto principal, sus colores reales, bordes, textura, sombras y perspectiva.',
    'No agregar texto, logos, marcas de agua ni objetos nuevos, salvo que el prompt o la instruccion del logo lo pidan explicitamente.',
  ].join('\n');

  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('image[]', new Blob([imageInput.buffer], { type: imageInput.mimeType }), imageInput.fileName);
  if (logoInput) {
    form.append('image[]', new Blob([logoInput.buffer], { type: logoInput.mimeType }), `rebu-logo-${logoInput.fileName}`);
  }
  decodedReferences.forEach((reference, index) => {
    form.append(
      'image[]',
      new Blob([reference.input.buffer], { type: reference.input.mimeType }),
      `rebu-reference-${index + 1}-${reference.input.fileName}`,
    );
  });
  form.append('prompt', finalPrompt);
  form.append('quality', 'medium');
  form.append('size', '1024x1024');
  form.append('output_format', 'webp');

  const response = await fetch(OPENAI_IMAGE_EDIT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      success: false,
      error: responseBody?.error?.message || `OpenAI respondio ${response.status}.`,
    };
  }

  const b64 = responseBody?.data?.[0]?.b64_json;
  if (!b64) {
    return { success: false, error: 'OpenAI no devolvio una imagen editable.' };
  }

  return {
    success: true,
    imageDataUrl: `data:image/webp;base64,${b64}`,
    revisedPrompt: responseBody?.data?.[0]?.revised_prompt || '',
    usage: responseBody?.usage || null,
  };
};

const sanitizePdfFileName = (value) => {
  const fallback = 'rebu-documento.pdf';
  const baseName = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 120);
  return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName || 'rebu-documento'}.pdf`;
};

const isTrustedIpcSender = (event) => Boolean(mainWindow && event?.sender === mainWindow.webContents);

const isAllowedAppNavigation = (targetUrl) => {
  try {
    const parsedUrl = new URL(targetUrl);
    const currentUrl = mainWindow?.webContents?.getURL?.() || '';
    const currentOrigin = currentUrl ? new URL(currentUrl).origin : '';
    if (isDev && parsedUrl.origin === currentOrigin) return true;
    return parsedUrl.protocol === 'file:';
  } catch {
    return false;
  }
};

const getPrimaryLocalIp = () => {
  try {
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const net of interfaces || []) {
        const isIPv4 = net?.family === 'IPv4' || net?.family === 4;
        if (isIPv4 && !net.internal && net.address) return net.address;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MIN_VALID_PDF_BYTES = 8 * 1024;

const preparePdfExportCapture = async (webContents) => {
  const state = await webContents.executeJavaScript(`
    (async () => {
      const root = document.documentElement;
      const body = document.body;
      root.dataset.theme = 'light';
      body.dataset.theme = 'light';
      root.dataset.pdfTheme = 'light';
      body.dataset.pdfTheme = 'light';
      body.dataset.pdfCapture = 'true';
      root.style.colorScheme = 'light';
      body.style.colorScheme = 'light';

      const exportRoot = document.querySelector('[data-pdf-export]');
      if (!exportRoot) return { ready: false, reason: 'missing-export-root' };

      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const images = Array.from(exportRoot.querySelectorAll('img'));
      await Promise.all(images.map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          });
        }
        if (typeof image.decode === 'function') {
          try { await image.decode(); } catch {}
        }
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const rect = exportRoot.getBoundingClientRect();
      const textLength = String(exportRoot.textContent || '').trim().length;
      return {
        ready: textLength >= 16 && rect.width >= 100 && rect.height >= 100,
        textLength,
        width: rect.width,
        height: rect.height,
        imageCount: images.length,
        imagesComplete: images.every((image) => image.complete),
      };
    })()
  `, true);

  if (!state?.ready) {
    throw new Error(`El documento no estaba listo para imprimir (${state?.reason || 'contenido incompleto'}).`);
  }

  return state;
};

const createValidatedPdf = async (webContents) => {
  await preparePdfExportCapture(webContents);

  let pdfData = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    pdfData = await webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      marginsType: 0,
    });
    if (pdfData?.length >= MIN_VALID_PDF_BYTES) return pdfData;
    await delay(250);
    await preparePdfExportCapture(webContents);
  }

  throw new Error('Electron gener\u00f3 un PDF vac\u00edo. El archivo no fue guardado; intent\u00e1 nuevamente.');
};

const waitForWebContentsLoad = (webContents, timeoutMs = 10000) =>
  new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      webContents.removeListener('did-finish-load', onFinish);
      webContents.removeListener('did-fail-load', onFail);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onFinish = () => finish({ success: true });
    const onFail = (_event, errorCode, errorDescription) => {
      // ERR_ABORTED (-3) suele aparecer cuando el proveedor redirige de login
      // a la zona restringida. No es un fallo real de sesion/carga.
      if (errorCode === -3) return;
      finish({ success: false, error: errorDescription || `Error de carga ${errorCode}` });
    };
    const timer = setTimeout(() => finish({ success: false, timeout: true }), timeoutMs);

    webContents.once('did-finish-load', onFinish);
    webContents.once('did-fail-load', onFail);
  });

const loadUrlAndWait = async (targetWindow, targetUrl, timeoutMs = 15000) => {
  const loadPromise = waitForWebContentsLoad(targetWindow.webContents, timeoutMs);
  try {
    await targetWindow.loadURL(targetUrl);
  } catch (error) {
    if (!String(error?.message || '').includes('ERR_ABORTED')) {
      throw error;
    }
  }
  return loadPromise;
};

const attachSupplierErrorLogging = (supplierWindow, label = 'supplier') => {
  const errorEvents = [];
  const pushErrorEvent = (type, payload = {}) => {
    const event = {
      type,
      at: new Date().toISOString(),
      url: supplierWindow.webContents.getURL(),
      ...payload,
    };
    errorEvents.push(event);
    if (errorEvents.length > 40) errorEvents.shift();
    console.error('[supplier-image:error]', label, type, JSON.stringify(event));
  };

  supplierWindow.__rebuSupplierErrorEvents = errorEvents;
  supplierWindow.__rebuSupplierPushErrorEvent = pushErrorEvent;

  supplierWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      pushErrorEvent('did-fail-load', { errorCode, errorDescription, validatedURL });
    }
  });

  return { errorEvents, pushErrorEvent };
};

const createSupplierBrowserWindow = ({ show = false, width = 1100, height = 760 } = {}) => {
  const supplierWindow = new BrowserWindow({
    width,
    height,
    show,
    parent: show ? mainWindow : undefined,
    title: 'Proveedor - Cotillon Casa Alberto',
    webPreferences: {
      partition: SUPPLIER_IMAGE_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  supplierWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//i.test(url) && url.includes('cotilloncasaalberto.com.ar')) {
      supplierWindow.loadURL(url);
    }
    return { action: 'deny' };
  });
  attachSupplierErrorLogging(supplierWindow, show ? 'login' : 'worker');

  return supplierWindow;
};

const getSupplierRestrictedUrl = () => {
  try {
    const currentUrl = supplierImageLoginWindow && !supplierImageLoginWindow.isDestroyed()
      ? supplierImageLoginWindow.webContents.getURL()
      : '';
    const parsedUrl = currentUrl ? new URL(currentUrl) : null;
    if (parsedUrl?.hostname?.includes('cotilloncasaalberto.com.ar')) {
      return `${parsedUrl.origin}${SUPPLIER_RESTRICTED_PATH}`;
    }
  } catch {
    // Si no hay URL valida de la ventana de login, usamos el origen historico del proveedor.
  }
  return `${SUPPLIER_DEFAULT_ORIGIN}${SUPPLIER_RESTRICTED_PATH}`;
};

const normalizeSupplierNavigationUrl = (targetUrl) => {
  try {
    const parsedUrl = new URL(String(targetUrl || '').trim(), SUPPLIER_DEFAULT_ORIGIN);
    if (!parsedUrl.hostname.includes('cotilloncasaalberto.com.ar')) return '';
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';
    if (parsedUrl.protocol === 'https:') parsedUrl.protocol = 'http:';
    return parsedUrl.href;
  } catch {
    return '';
  }
};

const getSupplierLoginState = async () => {
  if (!supplierImageLoginWindow || supplierImageLoginWindow.isDestroyed()) {
    return { hasWindow: false, url: '', isLikelyLoggedIn: false };
  }

  const url = supplierImageLoginWindow.webContents.getURL();
  let pageState = null;
  try {
    pageState = await supplierImageLoginWindow.webContents.executeJavaScript(
      `(() => {
        const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
        const visiblePasswordInputs = passwordInputs.filter((input) => {
          const style = window.getComputedStyle(input);
          const rect = input.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });
        return {
          text: String(document.body?.innerText || "").slice(0, 1200),
          hasVisiblePasswordInput: visiblePasswordInputs.length > 0,
        };
      })()`,
      true
    );
  } catch {
    pageState = null;
  }
  const normalized = String(pageState?.text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isLoginText = normalized.includes('usuario') && (normalized.includes('clave') || normalized.includes('contrasena'));
  const isLikelyLoggedIn =
    /index_restringido|seccion_detalle|pedido/i.test(url || '') &&
    !/login/i.test(url || '') &&
    !pageState?.hasVisiblePasswordInput;

  return { hasWindow: true, url, isLikelyLoggedIn, hasVisiblePasswordInput: Boolean(pageState?.hasVisiblePasswordInput), isLoginText };
};

const buildSupplierSearchScript = (searchValue) => `
(() => {
  try {
    const searchValue = ${JSON.stringify(String(searchValue || '').trim())};
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
    const textOf = (node) => normalize(node?.innerText || node?.textContent || '');
    const bodyText = textOf(document.body);
    const hasVisiblePasswordInput = Array.from(document.querySelectorAll('input[type="password"]')).some((input) => {
      const style = window.getComputedStyle(input);
      const rect = input.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const isLoginPage =
      /login\\.php/i.test(location.href || '') ||
      hasVisiblePasswordInput ||
      (/login/i.test(document.title || '') && bodyText.includes('usuario'));

    const setInputValue = (input, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, value);
      } else {
        input.value = value;
      }
    };
    const searchInput = document.querySelector('input#buscar_txt[name="buscar_txt"]') ||
      document.querySelector('input#buscar_txt') ||
      document.querySelector('input[name="buscar_txt"]');

    if (!searchValue) return { submitted: false, isLoginPage, reason: 'empty_search', url: location.href };
    if (isLoginPage) return { submitted: false, isLoginPage, reason: 'login_required', url: location.href };
    if (!searchInput) return { submitted: false, isLoginPage, reason: 'search_field_not_found', url: location.href };

    setInputValue(searchInput, searchValue);
    searchInput.focus();

    const form = searchInput.form || searchInput.closest('form');
    if (!form) {
      return {
        submitted: false,
        isLoginPage,
        reason: 'search_form_not_found',
        inputName: searchInput.name || searchInput.id || '',
        url: location.href,
      };
    }

    const submitButton = Array.from(form.querySelectorAll('button, input')).find((element) => {
      const type = normalize(element.type || '');
      return type === 'submit' && !element.disabled;
    });

    window.setTimeout(() => {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit(submitButton || undefined);
      } else if (submitButton && typeof submitButton.click === 'function') {
        submitButton.click();
      } else {
        HTMLFormElement.prototype.submit.call(form);
      }
    }, 0);

    return {
      submitted: true,
      via: 'supplier-search-input',
      inputName: searchInput.name || searchInput.id || '',
      value: searchValue,
      url: location.href,
    };
  } catch (error) {
    return {
      submitted: false,
      isLoginPage: false,
      reason: 'script_error',
      message: error?.message || 'Error ejecutando busqueda en proveedor.',
      stack: error?.stack || '',
      url: location.href,
    };
  }
})()
`;

const buildSupplierTitleSearchQueries = (title) => {
  const rawTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (!rawTitle) return [];

  const normalize = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const stopWords = new Set([
    'unidad', 'unidades', 'unid', 'unidads', 'color', 'colores',
    'surtido', 'surtida', 'surtidos', 'surtidas', 'importado',
    'importada', 'nro', 'numero', 'modelo', 'cod', 'codigo',
  ]);

  const originalWords = rawTitle.split(/\s+/);
  const significantOriginal = originalWords.filter((word) => {
    const normalizedWord = normalize(word);
    const compactWord = normalizedWord.replace(/\s+/g, '');
    if (!compactWord || compactWord.length < 4) return false;
    if (/^x?\d+[a-z]*$/i.test(compactWord)) return false;
    if (stopWords.has(compactWord)) return false;
    return true;
  });

  const queries = [
    rawTitle,
    significantOriginal.slice(0, 5).join(' '),
    significantOriginal.slice(0, 4).join(' '),
    significantOriginal.slice(0, 3).join(' '),
    significantOriginal.slice(-3).join(' '),
  ]
    .map((query) => String(query || '').replace(/\s+/g, ' ').trim())
    .filter((query) => query.length >= 4);

  return [...new Set(queries)].slice(0, 5);
};

const buildSupplierExtractScript = (barcode, productTitle, searchMode = '') => `
(function () {
  try {
    var barcode = ${JSON.stringify(String(barcode || '').trim())};
    var productTitle = ${JSON.stringify(String(productTitle || '').trim())};
    var searchMode = ${JSON.stringify(String(searchMode || '').trim())};
    var normalize = function (value) {
      return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
    };
    var compactDigits = function (value) {
      return String(value || '').replace(/\\D/g, '').replace(/^0+/, '') || String(value || '').replace(/\\D/g, '');
    };
    var barcodeDigits = compactDigits(barcode);
    var cleanText = function (value) {
      return String(value || '').replace(/\\s+/g, ' ').trim();
    };
    var bodyText = normalize((document.body && (document.body.innerText || document.body.textContent)) || '');
    var passwordInputs = Array.prototype.slice.call(document.querySelectorAll('input[type="password"]'));
    var hasVisiblePasswordInput = passwordInputs.some(function (input) {
      var style = window.getComputedStyle(input);
      var rect = input.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    var isLoginPage =
      /login\\.php/i.test(location.href || '') ||
      hasVisiblePasswordInput ||
      (/login/i.test(document.title || '') && bodyText.includes('usuario'));

    if (isLoginPage) {
      return { status: 'login_required', message: 'La sesion del proveedor necesita login.', url: location.href };
    }

    var barcodeText = normalize(barcode);
    var tokenStopWords = {
      unidad: true,
      unidades: true,
      unid: true,
      color: true,
      colores: true,
      surtido: true,
      surtida: true,
      surtidos: true,
      surtidas: true,
      importado: true,
      importada: true,
      codigo: true,
      cod: true,
      numero: true,
      modelo: true
    };
    var normalizeToken = function (value) {
      return normalize(value).replace(/[^a-z0-9]/g, '');
    };
    var titleTokens = normalize(productTitle)
      .split(/\\s+/)
      .map(normalizeToken)
      .filter(function (token) {
        return token.length >= 4 && !tokenStopWords[token] && !/^x?\\d+[a-z]*$/i.test(token);
      })
      .slice(0, 8);
    var levenshtein = function (a, b) {
      if (a === b) return 0;
      if (!a) return b.length;
      if (!b) return a.length;
      var prev = [];
      var curr = [];
      for (var j = 0; j <= b.length; j += 1) prev[j] = j;
      for (var i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        for (var k = 1; k <= b.length; k += 1) {
          var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
          curr[k] = Math.min(
            curr[k - 1] + 1,
            prev[k] + 1,
            prev[k - 1] + cost
          );
        }
        var temp = prev;
        prev = curr;
        curr = temp;
      }
      return prev[b.length];
    };
    var tokenMatchesText = function (token, text) {
      if (!token || !text) return false;
      if (text.includes(token)) return true;
      var words = text.split(/\\s+/).map(normalizeToken).filter(function (word) { return word.length >= 4; });
      return words.some(function (word) {
        if (word.includes(token) || token.includes(word)) return true;
        if (token.length >= 5 && word.length >= 5 && token.slice(0, 4) === word.slice(0, 4)) return true;
        var maxLen = Math.max(token.length, word.length);
        var distance = levenshtein(token, word);
        return maxLen <= 6 ? distance <= 1 : distance <= 2;
      });
    };
    var imageNodes = Array.prototype.slice.call(document.images || []);
    var seenSources = {};
    var isSupplierDetailUrl = function (href) {
      return /\/pedido\/detalle(?:_mobile)?\.php\?[^#]*\bidp=\d+/i.test(String(href || ''));
    };
    var getSupplierProductId = function (href) {
      try {
        return new URL(href, location.href).searchParams.get('idp') || '';
      } catch (hrefError) {
        return '';
      }
    };
    var normalizeSupplierHref = function (href) {
      try {
        if (!href) return '';
        var parsedHref = new URL(href, location.href);
        if (
          parsedHref.hostname.includes('cotilloncasaalberto.com.ar') &&
          location.protocol === 'http:' &&
          parsedHref.protocol === 'https:'
        ) {
          parsedHref.protocol = 'http:';
        }
        return parsedHref.href;
      } catch (hrefError) {
        return '';
      }
    };
    var getNearestProductLink = function (startNode) {
      var node = startNode;
      for (var depth = 0; depth < 10 && node; depth += 1) {
        var directLink = typeof node.closest === 'function' ? node.closest('a[href]') : null;
        var linkList = typeof node.querySelectorAll === 'function' ? Array.prototype.slice.call(node.querySelectorAll('a[href]')) : [];
        if (directLink) linkList.unshift(directLink);
        var detailLink = linkList.map(function (candidate) {
          return normalizeSupplierHref(candidate && candidate.href);
        }).find(function (href) {
          return (
            href &&
            href.includes('cotilloncasaalberto.com.ar') &&
            isSupplierDetailUrl(href) &&
            !/javascript:|mailto:|whatsapp|facebook|instagram|youtube|imagen\\/producto|idcarpeta=/i.test(href)
          );
        });
        if (detailLink) {
          return detailLink;
        }
        node = node.parentElement;
      }
      var productContainers = Array.prototype.slice.call(document.querySelectorAll('.producto, .caja_productos, [class*="producto"]'));
      var matchingContainer = productContainers.find(function (container) {
        if (!container || typeof container.querySelectorAll !== 'function') return false;
        var hrefs = Array.prototype.slice.call(container.querySelectorAll('a[href]')).map(function (link) {
          return normalizeSupplierHref(link && link.href);
        });
        if (!hrefs.some(isSupplierDetailUrl)) return false;
        var containerText = cleanText(container.innerText || container.textContent || '');
        return barcodeDigits
          ? compactDigits(containerText).includes(barcodeDigits)
          : false;
      });
      if (matchingContainer) {
        var fallbackDetailLink = Array.prototype.slice.call(matchingContainer.querySelectorAll('a[href]')).map(function (link) {
          return normalizeSupplierHref(link && link.href);
        }).find(isSupplierDetailUrl);
        if (fallbackDetailLink) return fallbackDetailLink;
      }
      return '';
    };

    var candidates = imageNodes.map(function (img) {
      var rawSrc = img.currentSrc || img.src || img.getAttribute('src') || '';
      if (!rawSrc) return null;
      var src;
      try {
        var srcUrl = new URL(rawSrc, location.href);
        if (
          srcUrl.hostname.includes('cotilloncasaalberto.com.ar') &&
          location.protocol === 'http:' &&
          srcUrl.protocol === 'https:'
        ) {
          srcUrl.protocol = 'http:';
        }
        src = srcUrl.href;
      } catch (srcError) {
        return null;
      }
      if (seenSources[src]) return null;
      seenSources[src] = true;

      var srcLower = normalize(src);
      var altLower = normalize(img.alt || img.title || '');
      var productContainer = typeof img.closest === 'function'
        ? (img.closest('.caja_productos') || img.closest('.producto'))
        : null;
      var productTitleLink = productContainer && productContainer.querySelector
        ? productContainer.querySelector('.producto_txt a[href], a[href*="detalle.php?idp="], a[href*="detalle_mobile.php?idp="]')
        : null;
      var structuredTitle = cleanText(
        (productTitleLink && (productTitleLink.innerText || productTitleLink.textContent)) ||
        (productContainer && productContainer.querySelector && productContainer.querySelector('.producto_txt')?.innerText) ||
        img.alt ||
        img.title ||
        ''
      );
      var structuredCodeText = cleanText(
        (productContainer && productContainer.querySelector && productContainer.querySelector('.producto_id')?.innerText) ||
        ''
      );
      var structuredCode = structuredCodeText.replace(/codigo\\s*:/i, '').replace(/\\D/g, '');
      var structuredCodeComparable = compactDigits(structuredCode);
      var width = Number(img.naturalWidth || img.width || 0);
      var height = Number(img.naturalHeight || img.height || 0);
      var isStructuredProductImage = Boolean(
        productContainer &&
        (
          img.classList?.contains('producto_imagen') ||
          /\\/imagen\\/producto\\//i.test(src)
        )
      );
      if ((width < 70 || height < 70) && !isStructuredProductImage) return null;
      if (isStructuredProductImage) {
        width = Math.max(width, 300);
        height = Math.max(height, 300);
      }
      if (srcLower.includes('logo') || srcLower.includes('banner') || srcLower.includes('sprite') || srcLower.includes('icon')) return null;
      if (/\\/imagen\\/producto\\/grande\\/f36613\\.jpg/i.test(src)) return null;

      var node = img;
      var contexts = [];
      var bestNode = img;
      for (var depth = 0; depth < 10 && node; depth += 1) {
        var rawContext = cleanText(node.innerText || node.textContent || '');
        var context = normalize(rawContext);
        if (context) contexts.push({ raw: rawContext, normalized: context, node: node });
        if (
          barcodeDigits &&
          compactDigits(rawContext).includes(barcodeDigits) &&
          rawContext.length < 900
        ) {
          bestNode = node;
          break;
        }
        node = node.parentElement;
      }

      var exactContext = barcodeDigits
        ? contexts.find(function (context) {
            return compactDigits(context.raw).includes(barcodeDigits);
          })
        : null;
      var readableContext = contexts.find(function (context) { return context.normalized.length > 20; });
      var contextText = normalize([
        structuredTitle,
        structuredCodeText,
        (exactContext && exactContext.normalized) || '',
        (readableContext && readableContext.normalized) || ''
      ].filter(Boolean).join(' '));
      var rawText = cleanText([
        structuredTitle,
        structuredCodeText,
        (exactContext && exactContext.raw) || '',
        (readableContext && readableContext.raw) || ''
      ].filter(Boolean).join(' '));
      var sourceDigits = compactDigits(src + ' ' + (img.alt || '') + ' ' + (img.title || ''));
      var hasBarcode = Boolean(
        barcodeDigits &&
        (
          (structuredCodeComparable && structuredCodeComparable === barcodeDigits) ||
          (!structuredCode && compactDigits(rawText).includes(barcodeDigits)) ||
          sourceDigits.includes(barcodeDigits)
        )
      );
      var titleSearchText = normalize(structuredTitle) + ' ' + contextText + ' ' + altLower;
      var tokenMatches = titleTokens.filter(function (token) { return tokenMatchesText(token, titleSearchText); }).length;
      var titleSimilarity = titleTokens.length > 0
        ? Math.round((tokenMatches / titleTokens.length) * 100)
        : 0;
      var productishSource = /producto|prod|grande|foto|imagen|catalogo|catalog|uploads/i.test(src);
      var productUrl = normalizeSupplierHref(productTitleLink && productTitleLink.href) || getNearestProductLink(productContainer || bestNode || img);
      var area = width * height;
      var score =
        (hasBarcode ? 200 : 0) +
        (productUrl ? 90 : -120) +
        (productishSource ? 35 : 0) +
        (tokenMatches * 10) +
        Math.min(50, Math.round(area / 14000));

      return {
        src: src,
        productUrl: productUrl,
        casaAlbertoId: getSupplierProductId(productUrl),
        title: cleanText(structuredTitle || rawText || img.alt || img.title || productTitle || 'Producto encontrado').slice(0, 160),
        supplierCode: structuredCode,
        width: width,
        height: height,
        score: score,
        hasBarcode: hasBarcode,
        tokenMatches: tokenMatches,
        titleSimilarity: titleSimilarity,
        productishSource: productishSource,
        contextLength: rawText.length,
      };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });

    var hasBarcodeInPage = Boolean(
      barcodeText &&
      (bodyText.includes(barcodeText) || (barcodeDigits && compactDigits(bodyText).includes(barcodeDigits)))
    );
    var matchedCandidates = candidates.filter(function (candidate) {
      return candidate.hasBarcode;
    }).map(function (candidate) {
      candidate.matchQuality = 'barcode_exact';
      return candidate;
    }).slice(0, 8);

    if (matchedCandidates.length === 0 && titleTokens.length > 0) {
      matchedCandidates = candidates.filter(function (candidate) {
        var requiredMatches = titleTokens.length <= 1 ? 1 : 2;
        return (
          !candidate.hasBarcode &&
          Boolean(candidate.productUrl) &&
          candidate.tokenMatches >= requiredMatches &&
          candidate.titleSimilarity >= 60
        );
      }).sort(function (a, b) {
        return (b.titleSimilarity - a.titleSimilarity) || (b.score - a.score);
      }).map(function (candidate) {
        candidate.matchQuality = 'title_similarity';
        return candidate;
      }).slice(0, 8);
    }

    if (matchedCandidates.length === 0) {
      return {
        status: 'not_found',
        message: searchMode === 'title'
          ? 'No se encontro una coincidencia suficiente por nombre.'
          : hasBarcodeInPage
            ? 'El codigo aparece, pero no hay imagen cercana para elegir.'
            : 'No aparecio el codigo exacto en los resultados.',
        url: location.href,
        candidatesSeen: candidates.length,
      };
    }

    var collectDetailImageCandidates = function (candidate) {
      if (!candidate.productUrl || !isSupplierDetailUrl(candidate.productUrl)) {
        return Promise.resolve([candidate]);
      }

      return fetch(candidate.productUrl, { credentials: 'include', cache: 'no-store' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var detailTitle = cleanText(
          (doc.querySelector('h1, h2, .titulo, .title, [class*="nombre"], [class*="producto"]') || {}).innerText ||
          candidate.title ||
          productTitle
        );
        var detailImages = Array.prototype.slice.call(doc.images || []).map(function (detailImg) {
          return normalizeSupplierHref(detailImg.currentSrc || detailImg.src || detailImg.getAttribute('src') || '');
        }).filter(function (src) {
          var srcLower = normalize(src);
          return (
            src &&
            src.includes('cotilloncasaalberto.com.ar') &&
            !seenSources['detail:' + src] &&
            !srcLower.includes('logo') &&
            !srcLower.includes('banner') &&
            !srcLower.includes('sprite') &&
            !srcLower.includes('icon') &&
            !/\\/imagen\\/producto\\/grande\\/f36613\\.jpg/i.test(src) &&
            /imagen\\/producto|producto\\/grande|producto\\/mediana|producto\\/chica|uploads|catalog/i.test(src)
          );
        }).slice(0, 8);

        if (detailImages.length === 0) return [candidate];
        return detailImages.map(function (src, index) {
          seenSources['detail:' + src] = true;
          return {
            src: src,
            productUrl: candidate.productUrl,
            casaAlbertoId: candidate.casaAlbertoId || getSupplierProductId(candidate.productUrl),
            title: detailTitle || candidate.title,
            supplierCode: candidate.supplierCode || '',
            width: candidate.width,
            height: candidate.height,
            score: candidate.score + Math.max(0, 20 - index),
            hasBarcode: candidate.hasBarcode,
            tokenMatches: candidate.tokenMatches,
            titleSimilarity: candidate.titleSimilarity,
            productishSource: true,
            contextLength: candidate.contextLength,
            matchQuality: candidate.matchQuality,
          };
        });
      }).catch(function () {
        return [candidate];
      });
    };

    var hydrateCandidate = function (candidate) {
      return fetch(candidate.src, { credentials: 'include', cache: 'no-store' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.blob();
      }).then(function (blob) {
        if (!String(blob.type || '').startsWith('image/')) throw new Error('La respuesta no es una imagen.');
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { reject(new Error('No se pudo leer la imagen.')); };
          reader.readAsDataURL(blob);
        });
      }).then(function (dataUrl) {
        return {
          foundTitle: candidate.title,
          imageUrl: candidate.src,
          productUrl: candidate.productUrl || '',
          casaAlbertoId: candidate.casaAlbertoId || getSupplierProductId(candidate.productUrl),
          supplierCode: candidate.supplierCode || '',
          imageDataUrl: dataUrl,
          width: candidate.width,
          height: candidate.height,
          score: candidate.score,
          matchQuality: candidate.matchQuality || (searchMode === 'title' ? 'title_similarity' : 'barcode_exact'),
          titleSimilarity: candidate.titleSimilarity || 0,
        };
      });
    };

    return matchedCandidates.reduce(function (chain, candidate) {
      return chain.then(function (hydratedCandidates) {
        return collectDetailImageCandidates(candidate).then(function (expandedCandidates) {
          return expandedCandidates.reduce(function (imageChain, expandedCandidate) {
            return imageChain.then(function () {
              return hydrateCandidate(expandedCandidate).then(function (hydrated) {
                hydratedCandidates.push(hydrated);
              }).catch(function (imageError) {
                return null;
              });
            });
          }, Promise.resolve()).then(function () {
            return hydratedCandidates;
          });
        });
      });
    }, Promise.resolve([])).then(function (hydratedCandidates) {
      if (hydratedCandidates.length === 0) {
        return {
          status: 'error',
          message: 'Se encontraron resultados, pero no se pudieron descargar sus imagenes.',
          url: location.href,
          candidatesSeen: matchedCandidates.length,
        };
      }

      var best = hydratedCandidates[0];
      return {
        status: 'found',
        barcode: barcode,
        productTitle: productTitle,
        foundTitle: best.foundTitle,
        imageUrl: best.imageUrl,
        productUrl: best.productUrl,
        casaAlbertoId: best.casaAlbertoId || '',
        supplierCode: best.supplierCode || '',
        imageDataUrl: best.imageDataUrl,
        width: best.width,
        height: best.height,
        score: best.score,
        matchQuality: best.matchQuality || (searchMode === 'title' ? 'title_similarity' : 'barcode_exact'),
        titleSimilarity: best.titleSimilarity || 0,
        candidates: hydratedCandidates,
        selectedCandidateIndex: 0,
        url: location.href,
      };
    });
  } catch (error) {
    return {
      status: 'error',
      message: error && error.message ? error.message : 'Error inspeccionando resultados del proveedor.',
      stack: error && error.stack ? error.stack : '',
      url: location.href,
    };
  }
})()
`;

const searchSupplierImageByBarcode = async ({ barcode, title, searchMode = '' }) => {
  const safeBarcode = String(barcode || '').trim();
  const safeTitle = String(title || '').replace(/\s+/g, ' ').trim();
  const titleOnly = searchMode === 'title_only' || !safeBarcode;
  if (!safeBarcode && !safeTitle) {
    return { status: 'skipped', message: 'Producto sin codigo ni nombre para buscar.' };
  }

  let workerWindow;
  try {
    workerWindow = createSupplierBrowserWindow({ show: false, width: 1000, height: 760 });

    const initialLoad = await loadUrlAndWait(workerWindow, getSupplierRestrictedUrl(), 10000);
    if (!initialLoad.success && !initialLoad.timeout) {
      return {
        status: 'error',
        message: initialLoad.error || 'No se pudo abrir el buscador del proveedor.',
      };
    }

    const waitAfterSearchSubmit = async (loadPromise) => {
      await loadPromise;
      await delay(350);
    };

    const runSearchAttempt = async ({ query, extractBarcode, fallbackSearch }) => {
      const extractCurrentPage = async (via) => {
        try {
          const extractResult = await workerWindow.webContents.executeJavaScript(
            buildSupplierExtractScript(extractBarcode || safeBarcode, safeTitle, fallbackSearch),
            true
          );
          return {
            ...extractResult,
            fallbackSearch: fallbackSearch || extractResult?.fallbackSearch || '',
            searchedQuery: query,
            searchedBarcode: extractBarcode || safeBarcode,
            originalBarcode: safeBarcode,
            via,
          };
        } catch (error) {
          workerWindow.__rebuSupplierPushErrorEvent?.('extract-script-error', {
            barcode: safeBarcode,
            query,
            fallbackSearch: fallbackSearch || 'barcode',
            title: safeTitle,
            message: error?.message || '',
            stack: error?.stack || '',
          });
          return {
            status: 'error',
            message: error?.message || 'Script de extraccion fallo en proveedor.',
            fallbackSearch: fallbackSearch || '',
            searchedQuery: query,
            via,
          };
        }
      };

      const runSubmitScript = async () => {
        const loadPromise = waitForWebContentsLoad(workerWindow.webContents, 6500);
        try {
          const submitResult = await workerWindow.webContents.executeJavaScript(
            buildSupplierSearchScript(query),
            true
          );
          return { submitResult, loadPromise };
        } catch (error) {
          workerWindow.__rebuSupplierPushErrorEvent?.('submit-script-error', {
            barcode: safeBarcode,
            query,
            fallbackSearch: fallbackSearch || 'barcode',
            title: safeTitle,
            message: error?.message || '',
            stack: error?.stack || '',
          });
          return {
            submitResult: {
              submitted: false,
              reason: 'script_error',
              message: error?.message || 'Script de busqueda fallo en proveedor.',
            },
            loadPromise,
          };
        }
      };

      let lastResult = null;
      const { submitResult, loadPromise } = await runSubmitScript();
      if (submitResult?.isLoginPage || submitResult?.reason === 'login_required') {
        return {
          status: 'login_required',
          message: 'Inicia sesion en el proveedor y volve a buscar.',
          fallbackSearch: fallbackSearch || '',
          searchedQuery: query,
          via: 'submit-script',
        };
      }

      if (submitResult?.submitted) {
        await waitAfterSearchSubmit(loadPromise);
        lastResult = await extractCurrentPage(submitResult?.via || 'submit-script');
        if (lastResult?.status === 'found' || lastResult?.status === 'login_required') {
          return lastResult;
        }
      } else {
        workerWindow.__rebuSupplierPushErrorEvent?.('submit-not-started', {
          barcode: safeBarcode,
          query,
          fallbackSearch: fallbackSearch || 'barcode',
          title: safeTitle,
          message: submitResult?.message || 'No se pudo iniciar la busqueda.',
          reason: submitResult?.reason || '',
          url: submitResult?.url || '',
        });
      }

      return lastResult || {
        status: 'not_found',
        message: fallbackSearch === 'title'
          ? 'No se encontro una coincidencia suficiente por nombre.'
          : 'No aparecio el codigo exacto en los resultados.',
        fallbackSearch: fallbackSearch || '',
        searchedQuery: query,
      };
    };

    const attempts = [];
    if (!titleOnly) {
      attempts.push({
        query: safeBarcode,
        extractBarcode: safeBarcode,
        fallbackSearch: '',
      });
    }

    const trimmedBarcode = !titleOnly && safeBarcode.length > 5 ? safeBarcode.slice(0, -1) : '';
    if (trimmedBarcode && trimmedBarcode !== safeBarcode) {
      attempts.push({
        query: trimmedBarcode,
        extractBarcode: trimmedBarcode,
        fallbackSearch: 'trimmed_barcode',
      });
    }

    for (const titleQuery of buildSupplierTitleSearchQueries(safeTitle)) {
      attempts.push({
        query: titleQuery,
        extractBarcode: safeBarcode,
        fallbackSearch: 'title',
      });
    }

    let lastResult = null;
    for (const attempt of attempts) {
      const result = await runSearchAttempt(attempt);
      lastResult = result;

      if (result?.status === 'found') {
        const message = result.fallbackSearch === 'trimmed_barcode'
          ? 'Coincidencia con codigo sin ultimo digito'
          : result.fallbackSearch === 'title'
            ? result.message || 'Coincidencia por nombre'
            : result.message;
        return {
          ...result,
          message,
        };
      }

      if (result?.status === 'login_required') return result;
      if (result?.status === 'error' && attempt.fallbackSearch !== 'title') {
        workerWindow.__rebuSupplierPushErrorEvent?.('search-attempt-error', {
          barcode: safeBarcode,
          query: attempt.query,
          fallbackSearch: attempt.fallbackSearch || 'barcode',
          title: safeTitle,
          message: result?.message || '',
          url: result?.url || workerWindow.webContents.getURL(),
        });
      }
    }

    if (lastResult?.status === 'error') {
      workerWindow.__rebuSupplierPushErrorEvent?.('extract-result-error', {
        barcode: safeBarcode,
        title: safeTitle,
        message: lastResult?.message || '',
        url: lastResult?.url || workerWindow.webContents.getURL(),
      });
    }
    return lastResult || { status: 'not_found', message: 'No se encontro foto.' };
  } catch (error) {
    workerWindow?.__rebuSupplierPushErrorEvent?.('search-error', {
      barcode: safeBarcode,
      title: safeTitle,
      message: error?.message || '',
      stack: error?.stack || '',
    });
    return { status: 'error', message: error?.message || 'Fallo la busqueda en el proveedor.' };
  } finally {
    if (workerWindow && !workerWindow.isDestroyed()) {
      workerWindow.close();
    }
  }
};

const buildSupplierPriceExtractScript = (request = {}) => `
(function () {
  try {
    var expectedCode = ${JSON.stringify(String(request?.supplierCode || '').trim())};
    var expectedTitle = ${JSON.stringify(String(request?.title || '').replace(/\s+/g, ' ').trim())};
    var expectedId = ${JSON.stringify(String(request?.casaAlbertoId || '').trim())};
    var normalize = function (value) {
      return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
    };
    var compactDigits = function (value) {
      var digits = String(value || '').replace(/\\D/g, '');
      return digits.replace(/^0+/, '') || digits;
    };
    var cleanText = function (value) {
      return String(value || '').replace(/\\s+/g, ' ').trim();
    };
    var parseMoney = function (value) {
      var raw = String(value || '').replace(/\\$/g, '').replace(/\\s/g, '').replace(/[^\\d,.-]/g, '');
      if (!raw) return null;
      var lastComma = raw.lastIndexOf(',');
      var lastDot = raw.lastIndexOf('.');
      if (lastComma > lastDot) {
        raw = raw.replace(/\\./g, '').replace(',', '.');
      } else {
        raw = raw.replace(/,/g, '');
      }
      var numberValue = Number(raw);
      return Number.isFinite(numberValue) ? numberValue : null;
    };
    var bodyText = normalize((document.body && (document.body.innerText || document.body.textContent)) || '');
    var passwordInputs = Array.prototype.slice.call(document.querySelectorAll('input[type="password"]'));
    var hasVisiblePasswordInput = passwordInputs.some(function (input) {
      var style = window.getComputedStyle(input);
      var rect = input.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    var isLoginPage =
      /login\\.php/i.test(location.href || '') ||
      hasVisiblePasswordInput ||
      (/login/i.test(document.title || '') && bodyText.includes('usuario'));
    if (isLoginPage) {
      return { status: 'login_required', message: 'La sesion del proveedor necesita login.', url: location.href };
    }

    var normalizeSupplierHref = function (href) {
      try {
        var parsedHref = new URL(href, location.href);
        if (
          parsedHref.hostname.includes('cotilloncasaalberto.com.ar') &&
          location.protocol === 'http:' &&
          parsedHref.protocol === 'https:'
        ) {
          parsedHref.protocol = 'http:';
        }
        return parsedHref.href;
      } catch (hrefError) {
        return '';
      }
    };
    var isDetailUrl = function (href) {
      return /\\/pedido\\/detalle(?:_mobile)?\\.php\\?[^#]*\\bidp=\\d+/i.test(String(href || ''));
    };
    var getSupplierProductId = function (href) {
      try {
        return new URL(href, location.href).searchParams.get('idp') || '';
      } catch (urlError) {
        return '';
      }
    };
    var findDetailLink = function (container) {
      if (isDetailUrl(location.href)) return normalizeSupplierHref(location.href);
      var links = Array.prototype.slice.call((container || document).querySelectorAll('a[href]'));
      var detailLink = links.map(function (link) {
        return normalizeSupplierHref(link.href);
      }).find(function (href) {
        return href && isDetailUrl(href);
      });
      return detailLink || '';
    };
    var getCodeFromText = function (text) {
      var match = cleanText(text).match(/c[oó]digo\\s*:?\\s*([0-9]+)/i);
      return match ? match[1] : '';
    };
    var readCandidate = function (container) {
      var detailLink = findDetailLink(container);
      var titleNode =
        (container && container.querySelector && container.querySelector('.producto_txt a[href], .producto_txt, h1, h2, [class*="titulo"], [class*="nombre"]')) ||
        document.querySelector('h1, h2, .producto_txt a[href], .producto_txt, [class*="titulo"], [class*="nombre"]');
      var priceNode =
        (container && container.querySelector && container.querySelector('.producto_precio, [class*="precio"]')) ||
        document.querySelector('.producto_precio, [class*="precio"]');
      var codeNode =
        (container && container.querySelector && container.querySelector('.producto_id, [class*="codigo"], [class*="code"]')) ||
        document.querySelector('.producto_id, [class*="codigo"], [class*="code"]');
      var imageNode =
        (container && container.querySelector && container.querySelector('.producto_imagen, img[src*="/imagen/producto/"]')) ||
        document.querySelector('.producto_imagen, img[src*="/imagen/producto/"]');
      var containerText = cleanText((container && (container.innerText || container.textContent)) || document.body.innerText || '');
      var priceText = cleanText(priceNode && (priceNode.innerText || priceNode.textContent) || '');
      if (!priceText) {
        var priceMatch = containerText.match(/\\$\\s*[0-9.]+(?:,[0-9]{1,2})?/);
        priceText = priceMatch ? priceMatch[0] : '';
      }
      var supplierPrice = parseMoney(priceText);
      var foundTitle = cleanText(titleNode && (titleNode.innerText || titleNode.textContent) || '');
      var supplierCode = getCodeFromText(codeNode && (codeNode.innerText || codeNode.textContent) || '') || getCodeFromText(containerText);
      var casaAlbertoId = getSupplierProductId(detailLink || location.href) || expectedId || '';
      var imageUrl = normalizeSupplierHref(imageNode && (imageNode.currentSrc || imageNode.src || imageNode.getAttribute('src'))) || '';

      return {
        foundTitle: foundTitle,
        supplierCode: supplierCode,
        supplierPrice: supplierPrice,
        priceText: priceText,
        productUrl: detailLink || normalizeSupplierHref(location.href),
        casaAlbertoId: casaAlbertoId,
        imageUrl: imageUrl,
        sourceUrl: normalizeSupplierHref(location.href),
        text: containerText,
      };
    };

    var containers = isDetailUrl(location.href)
      ? [document.body]
      : Array.prototype.slice.call(document.querySelectorAll('.producto, .caja_productos, [class*="producto"]'));
    if (containers.length === 0) containers = [document.body];

    var expectedDigits = compactDigits(expectedCode);
    var expectedTitleNorm = normalize(expectedTitle);
    var candidates = containers
      .map(readCandidate)
      .filter(function (candidate) {
        return candidate && candidate.supplierPrice !== null && candidate.foundTitle;
      })
      .map(function (candidate) {
        var codeDigits = compactDigits(candidate.supplierCode);
        var titleNorm = normalize(candidate.foundTitle);
        var score = 0;
        if (expectedId && String(candidate.casaAlbertoId) === String(expectedId)) score += 100;
        if (expectedDigits && codeDigits && (codeDigits === expectedDigits || codeDigits === expectedDigits.slice(0, -1) || expectedDigits === codeDigits.slice(0, -1))) score += 80;
        if (expectedTitleNorm && titleNorm.includes(expectedTitleNorm.slice(0, 18))) score += 20;
        return { candidate: candidate, score: score };
      })
      .sort(function (a, b) { return b.score - a.score; });

    var best = candidates[0] && candidates[0].candidate;
    if (!best) {
      return {
        status: 'not_found',
        message: 'No se pudo leer el precio del proveedor.',
        url: location.href,
      };
    }

    return {
      status: 'found',
      supplierPrice: best.supplierPrice,
      foundTitle: best.foundTitle,
      supplierCode: best.supplierCode,
      casaAlbertoId: best.casaAlbertoId,
      productUrl: best.productUrl,
      sourceUrl: best.sourceUrl,
      imageUrl: best.imageUrl,
      priceText: best.priceText,
      url: location.href,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error && error.message ? error.message : 'Error leyendo precio del proveedor.',
      stack: error && error.stack ? error.stack : '',
      url: location.href,
    };
  }
})()
`;

const getSupplierPriceTargetUrl = ({ productUrl = '', casaAlbertoId = '' } = {}) => {
  try {
    const rawUrl = String(productUrl || '').trim();
    if (rawUrl) {
      const parsedUrl = new URL(rawUrl, SUPPLIER_DEFAULT_ORIGIN);
      if (parsedUrl.hostname.includes('cotilloncasaalberto.com.ar')) {
        if (parsedUrl.protocol === 'https:') parsedUrl.protocol = 'http:';
        return parsedUrl.href;
      }
    }
  } catch {
    // Si el enlace guardado no es valido, se intenta por ID o buscador.
  }

  const safeId = String(casaAlbertoId || '').replace(/\D/g, '');
  return safeId ? `${SUPPLIER_DEFAULT_ORIGIN}/pedido/detalle.php?idp=${safeId}` : '';
};

const searchSupplierPrice = async ({ productUrl = '', casaAlbertoId = '', supplierCode = '', title = '' } = {}) => {
  const safeTitle = String(title || '').replace(/\s+/g, ' ').trim();
  const safeCode = String(supplierCode || '').trim();
  const targetUrl = getSupplierPriceTargetUrl({ productUrl, casaAlbertoId });

  let workerWindow;
  try {
    workerWindow = createSupplierBrowserWindow({ show: false, width: 1000, height: 760 });

    const extractCurrentPage = async () => {
      try {
        return await workerWindow.webContents.executeJavaScript(
          buildSupplierPriceExtractScript({ productUrl, casaAlbertoId, supplierCode: safeCode, title: safeTitle }),
          true
        );
      } catch (error) {
        workerWindow.__rebuSupplierPushErrorEvent?.('price-extract-script-error', {
          productUrl,
          casaAlbertoId,
          supplierCode: safeCode,
          title: safeTitle,
          message: error?.message || '',
          stack: error?.stack || '',
        });
        return { status: 'error', message: error?.message || 'Script de precio fallo en proveedor.' };
      }
    };

    if (targetUrl) {
      const directLoad = await loadUrlAndWait(workerWindow, targetUrl, 10000);
      if (!directLoad.success && !directLoad.timeout) {
        workerWindow.__rebuSupplierPushErrorEvent?.('price-direct-load-error', {
          targetUrl,
          message: directLoad.error || '',
        });
      }
      await delay(350);
      const directResult = await extractCurrentPage();
      if (directResult?.status === 'found' || directResult?.status === 'login_required') {
        return { ...directResult, via: 'direct-url' };
      }
    }

    const initialLoad = await loadUrlAndWait(workerWindow, getSupplierRestrictedUrl(), 10000);
    if (!initialLoad.success && !initialLoad.timeout) {
      return {
        status: 'error',
        message: initialLoad.error || 'No se pudo abrir el buscador del proveedor.',
      };
    }

    const queries = [
      safeCode,
      safeCode.length > 5 ? safeCode.slice(0, -1) : '',
      ...buildSupplierTitleSearchQueries(safeTitle),
    ].filter(Boolean);

    let lastResult = null;
    for (const query of [...new Set(queries)]) {
      const loadPromise = waitForWebContentsLoad(workerWindow.webContents, 6500);
      const submitResult = await workerWindow.webContents.executeJavaScript(buildSupplierSearchScript(query), true);

      if (submitResult?.isLoginPage || submitResult?.reason === 'login_required') {
        return { status: 'login_required', message: 'Inicia sesion en el proveedor y volve a chequear precios.', via: 'search' };
      }
      if (!submitResult?.submitted) {
        lastResult = {
          status: 'error',
          message: submitResult?.message || 'No se pudo iniciar la busqueda de precio.',
          via: 'search',
          searchedQuery: query,
        };
        continue;
      }

      await loadPromise;
      await delay(350);
      const result = await extractCurrentPage();
      lastResult = { ...result, via: 'search', searchedQuery: query };
      if (result?.status === 'found' || result?.status === 'login_required') return lastResult;
    }

    return lastResult || { status: 'not_found', message: 'No se encontro precio para este enlace.' };
  } catch (error) {
    workerWindow?.__rebuSupplierPushErrorEvent?.('price-search-error', {
      productUrl,
      casaAlbertoId,
      supplierCode: safeCode,
      title: safeTitle,
      message: error?.message || '',
      stack: error?.stack || '',
    });
    return { status: 'error', message: error?.message || 'Fallo el chequeo de precio en el proveedor.' };
  } finally {
    if (workerWindow && !workerWindow.isDestroyed()) {
      workerWindow.close();
    }
  }
};

app.setName(APP_NAME);

if (isDev) {
  const devDataPath = path.join(app.getPath('appData'), 'RebuCotillonSystemDev');
  const devSessionPath = path.join(devDataPath, 'Session');
  const devCachePath = path.join(devDataPath, 'Cache');

  fs.mkdirSync(devSessionPath, { recursive: true });
  fs.mkdirSync(devCachePath, { recursive: true });

  app.setPath('userData', devDataPath);
  app.setPath('sessionData', devSessionPath);
  app.commandLine.appendSwitch('disk-cache-dir', devCachePath);
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_NAME,
    icon: path.join(__dirname, 'public/rebu-logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL
    || (isDev ? 'http://127.0.0.1:5173' : `file://${path.join(__dirname, './dist/index.html')}`);
  mainWindow.loadURL(startUrl);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedAppNavigation(targetUrl)) return;
    event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

app.on('ready', () => {
  ipcMain.handle('save-as-pdf', async (event, defaultName) => {
    try {
      if (!isTrustedIpcSender(event)) return { success: false, error: 'Origen IPC no autorizado' };
      const isPackaged = app.isPackaged;
      const basePath = isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
      const suggestedPath = path.join(basePath, sanitizePdfFileName(defaultName));

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar PDF',
        defaultPath: suggestedPath,
        filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
      });

      if (!filePath) return { success: false, canceled: true };

      const pdfData = await createValidatedPdf(mainWindow.webContents);

      fs.writeFileSync(filePath, pdfData);

      return { success: true, filePath };
    } catch (error) {
      console.error('Error generando PDF:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-device-info', async (event) => {
    if (!isTrustedIpcSender(event)) return null;
    return {
      deviceName: os.hostname?.() || 'Equipo desconocido',
      ipAddress: getPrimaryLocalIp() || 'No disponible',
      platform: `${os.platform?.() || 'desktop'} ${os.release?.() || ''}`.trim(),
      runtime: 'Electron',
    };
  });

  ipcMain.handle('clear-host-resolver-cache', async (event) => {
    if (!isTrustedIpcSender(event)) {
      return { success: false, error: 'Origen IPC no autorizado' };
    }

    try {
      await session.defaultSession.clearHostResolverCache();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'No se pudo limpiar la cache DNS de Electron.',
      };
    }
  });

  ipcMain.handle('open-external-url', async (event, targetUrl) => {
    if (!isTrustedIpcSender(event)) return { success: false, error: 'Origen IPC no autorizado' };
    try {
      const parsedUrl = new URL(String(targetUrl || ''));
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { success: false, error: 'URL no permitida' };
      }
      await shell.openExternal(parsedUrl.href);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || 'No se pudo abrir el enlace.' };
    }
  });

  ipcMain.handle('supplier-image-open-login', async (event) => {
    if (!isTrustedIpcSender(event)) return { success: false, error: 'Origen IPC no autorizado' };

    try {
      if (supplierImageLoginWindow && !supplierImageLoginWindow.isDestroyed()) {
        supplierImageLoginWindow.show();
        supplierImageLoginWindow.focus();
        return { success: true, reused: true, loginState: await getSupplierLoginState() };
      }

      supplierImageLoginWindow = createSupplierBrowserWindow({ show: true, width: 1120, height: 780 });
      supplierImageLoginWindow.on('closed', () => {
        supplierImageLoginWindow = null;
      });

      await loadUrlAndWait(supplierImageLoginWindow, SUPPLIER_LOGIN_URL, 18000);
      return { success: true, loginState: await getSupplierLoginState() };
    } catch (error) {
      return { success: false, error: error?.message || 'No se pudo abrir el login del proveedor.' };
    }
  });

  ipcMain.handle('supplier-image-login-state', async (event) => {
    if (!isTrustedIpcSender(event)) return { hasWindow: false, isLikelyLoggedIn: false };
    return getSupplierLoginState();
  });

  ipcMain.handle('supplier-open-url', async (event, targetUrl) => {
    if (!isTrustedIpcSender(event)) return { success: false, error: 'Origen IPC no autorizado' };

    try {
      const safeUrl = normalizeSupplierNavigationUrl(targetUrl);
      if (!safeUrl) {
        return { success: false, error: 'El enlace no pertenece a Casa Alberto.' };
      }

      if (!supplierImageLoginWindow || supplierImageLoginWindow.isDestroyed()) {
        supplierImageLoginWindow = createSupplierBrowserWindow({ show: true, width: 1120, height: 780 });
        supplierImageLoginWindow.on('closed', () => {
          supplierImageLoginWindow = null;
        });
      } else {
        supplierImageLoginWindow.show();
        supplierImageLoginWindow.focus();
      }

      await loadUrlAndWait(supplierImageLoginWindow, safeUrl, 18000);
      return {
        success: true,
        url: supplierImageLoginWindow.webContents.getURL(),
        loginState: await getSupplierLoginState(),
      };
    } catch (error) {
      return { success: false, error: error?.message || 'No se pudo abrir Casa Alberto.' };
    }
  });

  ipcMain.handle('supplier-image-search', async (event, request) => {
    if (!isTrustedIpcSender(event)) {
      return { status: 'error', message: 'Origen IPC no autorizado' };
    }

    const barcode = String(request?.barcode || '').trim();
    const title = String(request?.title || '').trim();
    const searchMode = String(request?.searchMode || '').trim();
    return searchSupplierImageByBarcode({ barcode, title, searchMode });
  });

  ipcMain.handle('supplier-price-search', async (event, request) => {
    if (!isTrustedIpcSender(event)) {
      return { status: 'error', message: 'Origen IPC no autorizado' };
    }

    return searchSupplierPrice({
      productUrl: request?.productUrl,
      casaAlbertoId: request?.casaAlbertoId,
      supplierCode: request?.supplierCode || request?.providerCode,
      title: request?.title,
    });
  });

  ipcMain.handle('openai-image-edit', async (event, request) => {
    if (!isTrustedIpcSender(event)) {
      return { success: false, error: 'Origen IPC no autorizado' };
    }

    try {
      return await editImageWithOpenAI(request || {});
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'No se pudo editar la imagen con OpenAI.',
      };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

autoUpdater.on('update-available', () => {
  console.log('Actualizacion disponible');
});

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});
