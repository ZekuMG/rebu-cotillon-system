import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Download,
  FileText,
  Image as ImageIcon,
  Package,
  Search,
  Square,
  Tags,
} from 'lucide-react';
import { FancyPrice } from './FancyPrice';
import { getProductImageUrl } from '../utils/productImages';

const WHATSAPP_CATALOG_COLUMNS = [
  'id',
  'sku',
  'nombre',
  'descripcion',
  'precio',
  'moneda',
  'categoria',
  'categorias',
  'disponibilidad',
  'stock',
  'tipo_venta',
  'imagen_url',
];
const CATALOG_VISIBLE_BATCH_SIZE = 120;

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const csvEscape = (value) => {
  const text = String(value ?? '');
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const slugifyFilePart = (value) => {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'sin-categoria';
};

const getProductCategories = (product = {}) => {
  if (Array.isArray(product.categories) && product.categories.length > 0) {
    return product.categories.map((category) => String(category || '').trim()).filter(Boolean);
  }

  return String(product.category || '')
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean);
};

const getProductSku = (product = {}) =>
  String(product.barcode || product.code || product.sku || product.id || '').trim();

const getCatalogPrice = (product = {}) => {
  const rawPrice = Number(product.price || 0);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0;
  return product.product_type === 'weight' ? Math.round(rawPrice * 1000) : rawPrice;
};

const isProductActiveForCatalog = (product = {}) => {
  if (product.isDeleted || product.deleted || product.deleted_at) return false;
  if (product.active === false || product.is_active === false) return false;
  if (String(product.status || '').toLowerCase() === 'deleted') return false;
  return true;
};

const buildCatalogDescription = (product = {}, categories = []) => {
  const base = String(product.description || product.details || '').trim();
  const typeText = product.product_type === 'weight' ? 'Venta por peso. Precio publicado por kg.' : 'Venta por unidad.';
  const categoryText = categories.length > 0 ? `Categoria: ${categories[0]}.` : '';
  return [base, typeText, categoryText].filter(Boolean).join(' ');
};

const getCatalogIssues = (product = {}) => {
  const categories = getProductCategories(product);
  const imageUrl = getProductImageUrl(product, { preferOriginal: true });
  const price = getCatalogPrice(product);
  const stock = Number(product.stock || 0);
  const title = String(product.title || '').trim();
  const issues = [];

  if (!title) issues.push('Sin nombre');
  if (title.length > 80) issues.push('Nombre largo');
  if (!imageUrl) issues.push('Sin foto');
  if (price <= 0) issues.push('Sin precio');
  if (categories.length === 0) issues.push('Sin categoria');
  if (stock <= 0) issues.push('Sin stock');

  return issues;
};

const buildCatalogRow = (product = {}) => {
  const categories = getProductCategories(product);
  const primaryCategory = categories[0] || 'Sin categoria';
  const price = getCatalogPrice(product);
  const stock = Number(product.stock || 0);
  const imageUrl = getProductImageUrl(product, { preferOriginal: true });

  return {
    id: product.id,
    sku: getProductSku(product),
    nombre: String(product.title || '').trim(),
    descripcion: buildCatalogDescription(product, categories),
    precio: price,
    moneda: 'ARS',
    categoria: primaryCategory,
    categorias: categories.join(' | '),
    disponibilidad: stock > 0 ? 'in stock' : 'out of stock',
    stock,
    tipo_venta: product.product_type === 'weight' ? 'por kg' : 'por unidad',
    imagen_url: imageUrl,
  };
};

const downloadCsv = (fileName, rows) => {
  const header = WHATSAPP_CATALOG_COLUMNS.join(',');
  const body = rows
    .map((row) => WHATSAPP_CATALOG_COLUMNS.map((column) => csvEscape(row[column])).join(','))
    .join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function WhatsAppCatalogExportView({ inventory = [], categories = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);

  const catalogProducts = useMemo(() =>
    (inventory || [])
      .filter(isProductActiveForCatalog)
      .map((product) => {
        const productCategories = getProductCategories(product);
        const issues = getCatalogIssues(product);
        return {
          ...product,
          catalogCategories: productCategories,
          catalogPrimaryCategory: productCategories[0] || 'Sin categoria',
          catalogIssues: issues,
          catalogReady: issues.length === 0,
          catalogImageUrl: getProductImageUrl(product, { preferOriginal: true }),
          catalogPrice: getCatalogPrice(product),
        };
      }),
  [inventory]);

  const availableCategories = useMemo(() => {
    const values = new Set(categories || []);
    catalogProducts.forEach((product) => {
      product.catalogCategories.forEach((category) => values.add(category));
    });
    return [...values].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
  }, [catalogProducts, categories]);

  const filteredProducts = useMemo(() => {
    const words = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    return catalogProducts.filter((product) => {
      const matchesCategory =
        selectedCategory === 'Todas' ||
        product.catalogCategories.includes(selectedCategory) ||
        (selectedCategory === 'Sin categoria' && product.catalogCategories.length === 0);
      if (!matchesCategory) return false;

      if (statusFilter === 'ready' && !product.catalogReady) return false;
      if (statusFilter === 'review' && product.catalogReady) return false;
      if (statusFilter === 'no_photo' && product.catalogImageUrl) return false;
      if (statusFilter === 'no_stock' && Number(product.stock || 0) > 0) return false;

      if (words.length === 0) return true;
      const searchable = normalizeText([
        product.title,
        product.barcode,
        product.code,
        product.sku,
        product.catalogCategories.join(' '),
      ].filter(Boolean).join(' '));
      return words.every((word) => searchable.includes(word));
    });
  }, [catalogProducts, searchTerm, selectedCategory, statusFilter]);

  const selectedIdsSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(CATALOG_VISIBLE_BATCH_SIZE, filteredProducts.length)
  );

  useEffect(() => {
    setVisibleCount(Math.min(CATALOG_VISIBLE_BATCH_SIZE, filteredProducts.length));
  }, [filteredProducts.length, searchTerm, selectedCategory, statusFilter]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  const selectedProducts = useMemo(
    () => catalogProducts.filter((product) => selectedIdsSet.has(String(product.id))),
    [catalogProducts, selectedIdsSet]
  );

  const catalogStats = useMemo(() => {
    let readyCount = 0;
    let noPhotoCount = 0;
    let noStockCount = 0;

    catalogProducts.forEach((product) => {
      if (product.catalogReady) readyCount += 1;
      if (!product.catalogImageUrl) noPhotoCount += 1;
      if (Number(product.stock || 0) <= 0) noStockCount += 1;
    });

    return {
      readyCount,
      noPhotoCount,
      noStockCount,
      reviewCount: catalogProducts.length - readyCount,
    };
  }, [catalogProducts]);

  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((product) => selectedIdsSet.has(String(product.id)));

  const toggleProduct = (productId) => {
    setSelectedIds((current) => {
      const productKey = String(productId);
      const exists = current.some((id) => String(id) === productKey);
      return exists ? current.filter((id) => String(id) !== productKey) : [...current, productId];
    });
  };

  const toggleVisibleProducts = () => {
    const visibleIds = visibleProducts.map((product) => product.id);
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleIds.map(String));
      setSelectedIds((current) => current.filter((id) => !visibleSet.has(String(id))));
      return;
    }

    setSelectedIds((current) => {
      const next = new Map(current.map((id) => [String(id), id]));
      visibleIds.forEach((id) => next.set(String(id), id));
      return [...next.values()];
    });
  };

  const selectReadyVisible = () => {
    const readyVisibleIds = visibleProducts
      .filter((product) => product.catalogReady)
      .map((product) => product.id);
    setSelectedIds((current) => {
      const next = new Map(current.map((id) => [String(id), id]));
      readyVisibleIds.forEach((id) => next.set(String(id), id));
      return [...next.values()];
    });
  };

  const handleCatalogScroll = useCallback((event) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining > 180) return;

    setVisibleCount((current) => {
      if (current >= filteredProducts.length) return current;
      return Math.min(current + CATALOG_VISIBLE_BATCH_SIZE, filteredProducts.length);
    });
  }, [filteredProducts.length]);

  const handleExportSelected = () => {
    if (selectedProducts.length === 0) return;
    downloadCsv('rebu-whatsapp-catalogo.csv', selectedProducts.map(buildCatalogRow));
  };

  const handleExportByCategory = () => {
    if (selectedProducts.length === 0) return;
    const groups = selectedProducts.reduce((acc, product) => {
      const category = getProductCategories(product)[0] || 'Sin categoria';
      if (!acc[category]) acc[category] = [];
      acc[category].push(buildCatalogRow(product));
      return acc;
    }, {});

    Object.entries(groups).forEach(([category, rows]) => {
      downloadCsv(`rebu-whatsapp-${slugifyFilePart(category)}.csv`, rows);
    });
  };

  const statusOptions = [
    { value: 'all', label: 'Todos', count: catalogProducts.length },
    { value: 'ready', label: 'Listos', count: catalogStats.readyCount },
    { value: 'review', label: 'Revisar', count: catalogStats.reviewCount },
    { value: 'no_photo', label: 'Sin foto', count: catalogStats.noPhotoCount },
    { value: 'no_stock', label: 'Sin stock', count: catalogStats.noStockCount },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <aside className="w-[300px] shrink-0 border-r border-slate-200 bg-slate-50/80">
        <div className="h-1 bg-emerald-500" />
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 custom-scrollbar">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Catalogo WhatsApp</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Seleccion y exportacion</h2>
            <p className="mt-1 text-[11px] font-bold leading-snug text-slate-500">
              Solo lectura: prepara CSV con precio real, categoria e imagen publica.
            </p>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="text-[10px] font-black uppercase text-emerald-700">Listos</p>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-900">{catalogStats.readyCount}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[10px] font-black uppercase text-amber-700">Revisar</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-900">{catalogStats.reviewCount}</p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Filtros</span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">{filteredProducts.length}</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar producto..."
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-bold text-slate-800 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-800 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            >
              <option value="Todas">Todas las categorias</option>
              <option value="Sin categoria">Sin categoria</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={`rounded-md border px-2 py-1.5 text-left text-[10px] font-black transition-colors ${
                    statusFilter === option.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <span className="block">{option.label}</span>
                  <span className="text-[9px] opacity-70">{option.count}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Seleccion</p>
            <button
              type="button"
              onClick={toggleVisibleProducts}
              disabled={filteredProducts.length === 0}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allVisibleSelected ? 'Quitar visibles' : 'Seleccionar visibles'}
            </button>
            <button
              type="button"
              onClick={selectReadyVisible}
              disabled={visibleProducts.every((product) => !product.catalogReady)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 size={14} />
              Sumar listos visibles
            </button>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Exportar</p>
            <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold text-slate-500">Seleccionados</p>
              <p className="text-lg font-black tabular-nums text-slate-900">{selectedProducts.length}</p>
            </div>
            <button
              type="button"
              onClick={handleExportSelected}
              disabled={selectedProducts.length === 0}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download size={14} />
              CSV general
            </button>
            <button
              type="button"
              onClick={handleExportByCategory}
              disabled={selectedProducts.length === 0}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Tags size={14} />
              CSV por categoria
            </button>
          </section>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Vista previa</p>
            <p className="truncate text-sm font-black text-slate-900">
              {filteredProducts.length} productos filtrados - {selectedProducts.length} seleccionados
            </p>
            {visibleProducts.length < filteredProducts.length ? (
              <p className="text-[10px] font-bold text-slate-400">
                Mostrando {visibleProducts.length} de {filteredProducts.length}
              </p>
            ) : null}
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-black text-slate-500 md:flex">
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> Listo</span>
            <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-amber-500" /> Revisar</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar" onScroll={handleCatalogScroll}>
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-900 text-white">
              <tr className="h-10">
                <th className="w-10 px-2 text-center">
                  <button type="button" onClick={toggleVisibleProducts} className="transition-colors hover:text-emerald-200">
                    {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </th>
                <th className="w-16 px-2 text-[10px] font-black uppercase tracking-wider">Foto</th>
                <th className="min-w-[260px] px-2 text-[10px] font-black uppercase tracking-wider">Producto</th>
                <th className="w-36 px-2 text-[10px] font-black uppercase tracking-wider">Categoria</th>
                <th className="w-28 px-2 text-right text-[10px] font-black uppercase tracking-wider">Precio</th>
                <th className="w-24 px-2 text-center text-[10px] font-black uppercase tracking-wider">Stock</th>
                <th className="w-48 px-2 text-[10px] font-black uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const isSelected = selectedIdsSet.has(String(product.id));
                return (
                  <tr
                    key={product.id}
                    className={`h-14 border-b border-slate-100 transition-colors last:border-b-0 ${
                      isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-0 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => toggleProduct(product.id)}
                        className={`transition-colors ${isSelected ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}
                      >
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </td>
                    <td className="p-0 align-middle">
                      <div className="flex h-14 items-center px-2">
                        {product.catalogImageUrl ? (
                          <img
                            src={product.catalogImageUrl}
                            alt={product.title}
                            loading="lazy"
                            decoding="async"
                            fetchpriority="low"
                            className="h-10 w-10 rounded-md border border-slate-200 object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                            <ImageIcon size={14} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-0 p-0 align-middle">
                      <div className="flex h-14 min-w-0 flex-col justify-center gap-1 px-2">
                        <p className="truncate text-xs font-black text-slate-900" title={product.title}>
                          {product.title || 'Sin nombre'}
                        </p>
                        <p className="truncate text-[10px] font-bold text-slate-400">
                          SKU {getProductSku(product) || '-'} - {product.product_type === 'weight' ? 'Precio por kg' : 'Precio por unidad'}
                        </p>
                      </div>
                    </td>
                    <td className="p-0 align-middle">
                      <div className="px-2">
                        <p className="truncate text-xs font-black text-slate-700" title={product.catalogCategories.join(', ')}>
                          {product.catalogPrimaryCategory}
                        </p>
                      </div>
                    </td>
                    <td className="p-0 text-right align-middle">
                      <div className="px-2 text-xs font-black tabular-nums text-slate-900">
                        <FancyPrice amount={product.catalogPrice} />
                      </div>
                    </td>
                    <td className="p-0 text-center align-middle">
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-black tabular-nums ${
                        Number(product.stock || 0) > 0
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}>
                        {Number(product.stock || 0)}{product.product_type === 'weight' ? 'g' : 'u'}
                      </span>
                    </td>
                    <td className="p-0 align-middle">
                      <div className="flex flex-wrap gap-1 px-2">
                        {product.catalogReady ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                            <CheckCircle2 size={11} />
                            Listo
                          </span>
                        ) : (
                          product.catalogIssues.map((issue) => (
                            <span
                              key={`${product.id}-${issue}`}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700"
                            >
                              <AlertTriangle size={11} />
                              {issue}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredProducts.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-slate-400">
              <Package size={28} />
              <p className="text-sm font-black text-slate-600">No hay productos para ese filtro</p>
              <p className="text-xs font-bold">Cambia busqueda, categoria o estado.</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
