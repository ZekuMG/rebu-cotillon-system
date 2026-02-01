import React, { useState } from 'react';
import {
  Search,
  List,
  LayoutGrid,
  Plus,
  Edit2,
  Trash2,
  Filter,
} from 'lucide-react';
import ProductImage from '../components/ProductImage';

export default function InventoryView({
  inventory,
  categories,
  currentUser,
  inventoryViewMode,
  setInventoryViewMode,
  inventorySearch,
  setInventorySearch,
  inventoryCategoryFilter,
  setInventoryCategoryFilter,
  setIsModalOpen,
  setEditingProduct,
  handleDeleteProduct,
  setSelectedImage,
  setIsImageModalOpen,
}) {
  const [gridSize, setGridSize] = useState('medium'); // 'small' | 'medium' | 'large'

  // Protección contra inventario nulo
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  // Filtro seguro
  const filteredInventory = safeInventory.filter((item) => {
    if (!item) return false;

    // Normalizar categorías del item
    const itemCategories =
      Array.isArray(item.categories) && item.categories.length > 0
        ? item.categories
        : item.category
        ? [item.category]
        : [];

    const itemTitle = (item.title || '').toLowerCase();
    const itemBrand = (item.brand || '').toLowerCase();
    const search = (inventorySearch || '').toLowerCase();

    // Filtro de categoría
    const matchCat =
      inventoryCategoryFilter === 'Todas' ||
      itemCategories.includes(inventoryCategoryFilter);

    const matchSearch =
      itemTitle.includes(search) || itemBrand.includes(search);

    return matchCat && matchSearch;
  });

  // Clases dinámicas para la grilla
  const getGridClasses = () => {
    switch (gridSize) {
      case 'small': // ~8 cols
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2';
      case 'medium': // ~6 cols
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3';
      case 'large': // ~4 cols
        return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
      default:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border flex flex-col h-full overflow-hidden">
      {/* Toolbar Compacto */}
      <div className="p-2 border-b flex flex-wrap justify-between items-center gap-2 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-slate-800">Inventario</h3>
          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
            {filteredInventory.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Buscador */}
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Buscar..."
              className="pl-8 pr-2 py-1.5 bg-white border rounded text-xs w-40 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
            />
          </div>

          {/* Filtro Categoría */}
          <select
            className="px-2 py-1.5 bg-white border rounded text-xs focus:outline-none max-w-[120px] cursor-pointer"
            value={inventoryCategoryFilter}
            onChange={(e) => setInventoryCategoryFilter(e.target.value)}
          >
            <option value="Todas">Todas</option>
            {(categories || []).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          {/* Selector de Tamaño (Solo visible en modo Grid) */}
          {inventoryViewMode === 'grid' && (
            <div className="flex bg-white rounded border overflow-hidden">
              <button
                onClick={() => setGridSize('small')}
                className={`px-2 py-1 text-[10px] font-bold hover:bg-slate-50 ${
                  gridSize === 'small'
                    ? 'bg-slate-100 text-fuchsia-700'
                    : 'text-slate-500'
                }`}
                title="Chico"
              >
                Chico
              </button>
              <button
                onClick={() => setGridSize('medium')}
                className={`px-2 py-1 text-[10px] font-bold hover:bg-slate-50 ${
                  gridSize === 'medium'
                    ? 'bg-slate-100 text-fuchsia-700'
                    : 'text-slate-500'
                }`}
                title="Mediano"
              >
                Med
              </button>
              <button
                onClick={() => setGridSize('large')}
                className={`px-2 py-1 text-[10px] font-bold hover:bg-slate-50 ${
                  gridSize === 'large'
                    ? 'bg-slate-100 text-fuchsia-700'
                    : 'text-slate-500'
                }`}
                title="Grande"
              >
                Grande
              </button>
            </div>
          )}

          {/* Selector de Vista */}
          <div className="flex border rounded overflow-hidden bg-white ml-1">
            <button
              onClick={() => setInventoryViewMode('list')}
              className={`p-1.5 ${
                inventoryViewMode === 'list'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setInventoryViewMode('grid')}
              className={`p-1.5 ${
                inventoryViewMode === 'grid'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {currentUser.role === 'admin' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-fuchsia-600 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1 hover:bg-fuchsia-700 shadow-sm font-bold ml-2"
            >
              <Plus size={14} /> Nuevo
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50">
        {filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
            <p>No se encontraron productos.</p>
            <p className="text-xs">
              Prueba cambiando el filtro de categoría o la búsqueda.
            </p>
          </div>
        ) : inventoryViewMode === 'list' ? (
          <div className="bg-white rounded border shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left w-10">Img</th>
                  <th className="px-2 py-2 text-left">Producto</th>
                  <th className="px-2 py-2 text-left">Categorías</th>
                  {currentUser.role === 'admin' && (
                    <th className="px-2 py-2 text-left">Costo</th>
                  )}
                  <th className="px-2 py-2 text-left">Precio</th>
                  <th className="px-2 py-2 text-left">Stock</th>
                  {currentUser.role === 'admin' && (
                    <th className="px-2 py-2 text-center">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 group">
                    <td className="px-2 py-2">
                      <ProductImage
                        item={item}
                        className="w-8 h-8 rounded bg-slate-100 object-cover border"
                        onClick={() => {
                          setSelectedImage(item.image);
                          setIsImageModalOpen(true);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {item.title}
                    </td>
                    <td className="px-2 py-2 text-slate-500">
                      {Array.isArray(item.categories) &&
                      item.categories.length > 0
                        ? item.categories.join(', ')
                        : item.category}
                    </td>
                    {currentUser.role === 'admin' && (
                      <td className="px-2 py-2 text-slate-400">
                        ${item.purchasePrice?.toLocaleString()}
                      </td>
                    )}
                    <td className="px-2 py-2 font-bold">
                      ${item.price.toLocaleString()}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.stock < 10
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {item.stock}
                      </span>
                    </td>
                    {currentUser.role === 'admin' && (
                      <td className="px-2 py-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingProduct({ ...item })}
                          className="text-blue-500 hover:bg-blue-50 p-1 rounded mr-1"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(item.id)}
                          className="text-red-500 hover:bg-red-50 p-1 rounded"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`grid ${getGridClasses()}`}>
            {filteredInventory.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded border overflow-hidden shadow-sm hover:shadow transition flex flex-col group"
              >
                <div className="relative aspect-square">
                  <ProductImage
                    item={item}
                    className="w-full h-full object-contain bg-white"
                    onClick={() => {
                      setSelectedImage(item.image);
                      setIsImageModalOpen(true);
                    }}
                  />
                  {item.stock < 10 && (
                    <div className="absolute top-1 right-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shadow-sm">
                      BAJO
                    </div>
                  )}
                </div>
                <div className="p-2 flex-1 flex flex-col border-t">
                  <span className="text-[9px] text-fuchsia-600 font-bold uppercase mb-0.5 truncate block">
                    {Array.isArray(item.categories) &&
                    item.categories.length > 0
                      ? item.categories.join(', ')
                      : item.category}
                  </span>
                  <h4
                    className={`font-bold text-slate-800 leading-tight flex-1 line-clamp-2 mb-1 ${
                      gridSize === 'small' ? 'text-[10px]' : 'text-xs'
                    }`}
                  >
                    {item.title}
                  </h4>
                  <div className="flex justify-between items-end mt-auto">
                    <span
                      className={`font-bold text-slate-900 ${
                        gridSize === 'small' ? 'text-xs' : 'text-sm'
                      }`}
                    >
                      ${item.price.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {item.stock}u
                    </span>
                  </div>

                  {currentUser.role === 'admin' && (
                    <div className="flex gap-1 mt-2 pt-2 border-t border-dashed opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingProduct({ ...item })}
                        className="flex-1 text-[10px] bg-blue-50 text-blue-600 py-1 rounded hover:bg-blue-100 flex items-center justify-center gap-1"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(item.id)}
                        className="flex-1 text-[10px] bg-red-50 text-red-600 py-1 rounded hover:bg-red-100 flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
