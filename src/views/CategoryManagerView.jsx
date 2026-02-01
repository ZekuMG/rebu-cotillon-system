import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Tag,
  AlertCircle,
  Pencil,
  X,
  Package,
  Save,
  Search,
  Check,
  PlusCircle,
  MinusCircle,
} from 'lucide-react';

export default function CategoryManagerView({
  categories,
  inventory,
  onAddCategory,
  onDeleteCategory,
  onEditCategory,
  onUpdateProductCategory, // Deprecated in favor of batch
  onBatchUpdateProductCategory, // New prop
}) {
  const [newCategory, setNewCategory] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editedName, setEditedName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showAddProducts, setShowAddProducts] = useState(false);

  // Estado local para cambios pendientes antes de guardar
  // Array de objetos: { productId, categoryName, action: 'add' | 'remove' }
  const [pendingChanges, setPendingChanges] = useState([]);

  // Limpiar pendientes al cerrar modal
  const handleCloseModal = () => {
    setSelectedCategory(null);
    setEditedName('');
    setShowAddProducts(false);
    setProductSearch('');
    setPendingChanges([]);
  };

  // Helper para verificar si un producto tiene una categoría (considerando pendientes)
  const productHasCategory = (product, catName) => {
    // 1. Estado original
    const originalCats = Array.isArray(product.categories)
      ? product.categories
      : product.category
      ? [product.category]
      : [];
    let hasCat = originalCats.includes(catName);

    // 2. Aplicar cambios pendientes
    const changes = pendingChanges.filter((c) => c.productId === product.id);
    changes.forEach((change) => {
      if (change.categoryName === catName) {
        if (change.action === 'add') hasCat = true;
        if (change.action === 'remove') hasCat = false;
      }
    });

    return hasCat;
  };

  // Productos por categoría (calculado con pendientes)
  const productsByCategory = useMemo(() => {
    const result = {};
    categories.forEach((cat) => {
      // Si estamos editando 'cat' (selectedCategory), usamos el cálculo dinámico
      if (selectedCategory === cat && inventory) {
        result[cat] = inventory.filter((p) => productHasCategory(p, cat));
      } else {
        // Para el resto, cálculo estático original
        result[cat] = inventory
          ? inventory.filter((p) => {
              if (Array.isArray(p.categories)) {
                return p.categories.includes(cat);
              }
              return p.category === cat;
            })
          : [];
      }
    });
    return result;
  }, [categories, inventory, pendingChanges, selectedCategory]);

  // Productos disponibles para AGREGAR (que NO están en la categoría)
  const availableProducts = useMemo(() => {
    if (!selectedCategory || !inventory) return [];
    return inventory.filter((p) => !productHasCategory(p, selectedCategory));
  }, [selectedCategory, inventory, pendingChanges]);

  // Filtrar productos disponibles por búsqueda
  const filteredAvailableProducts = useMemo(() => {
    if (!productSearch.trim()) return availableProducts;
    return availableProducts.filter((p) =>
      p.title.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [availableProducts, productSearch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  const handleSelectCategory = (cat) => {
    if (isEditMode) {
      setSelectedCategory(cat);
      setEditedName(cat);
      setShowAddProducts(false);
      setProductSearch('');
      setPendingChanges([]);
    }
  };

  const handleSaveEdit = () => {
    // 1. Guardar cambios de productos
    if (pendingChanges.length > 0 && onBatchUpdateProductCategory) {
      // Si cambió el nombre, debemos usar el nombre VIEJO para los cambios de productos
      // porque el ID de la categoría en el inventario es el nombre viejo.
      // El rename de categoría se encarga de actualizar los strings en los productos después.
      // Sin embargo, para consistencia, aplicamos los cambios a la categoría actual (selectedCategory)
      const sanitizedChanges = pendingChanges.map((c) => ({
        ...c,
        categoryName: selectedCategory, // Aseguramos que apunte a la ID correcta antes del rename
      }));
      onBatchUpdateProductCategory(sanitizedChanges);
    }

    // 2. Guardar cambio de nombre
    if (editedName.trim() && editedName !== selectedCategory) {
      onEditCategory(selectedCategory, editedName.trim());
    }

    handleCloseModal();
    setIsEditMode(false);
  };

  // Agregar producto a la cola de cambios
  const handleAddProductToCategory = (product) => {
    // Verificar si ya había una acción opuesta pendiente para cancelarla
    const existingChangeIndex = pendingChanges.findIndex(
      (c) => c.productId === product.id && c.categoryName === selectedCategory
    );

    if (existingChangeIndex >= 0) {
      // Si ya existía (ej: era 'remove'), lo quitamos del array (vuelve a estado original)
      const newChanges = [...pendingChanges];
      newChanges.splice(existingChangeIndex, 1);
      setPendingChanges(newChanges);
    } else {
      // Agregar nueva acción
      setPendingChanges([
        ...pendingChanges,
        {
          productId: product.id,
          categoryName: selectedCategory,
          action: 'add',
        },
      ]);
    }
  };

  // Quitar producto a la cola de cambios
  const handleRemoveProductFromCategory = (product) => {
    const existingChangeIndex = pendingChanges.findIndex(
      (c) => c.productId === product.id && c.categoryName === selectedCategory
    );

    if (existingChangeIndex >= 0) {
      const newChanges = [...pendingChanges];
      newChanges.splice(existingChangeIndex, 1);
      setPendingChanges(newChanges);
    } else {
      setPendingChanges([
        ...pendingChanges,
        {
          productId: product.id,
          categoryName: selectedCategory,
          action: 'remove',
        },
      ]);
    }
  };

  const hasUnsavedChanges =
    pendingChanges.length > 0 ||
    (editedName.trim() !== '' && editedName !== selectedCategory);

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-sm border mt-10">
      <div className="flex items-center gap-3 mb-6 border-b pb-4">
        <div className="p-2 bg-fuchsia-100 text-fuchsia-600 rounded-lg">
          <Tag size={24} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            Gestión de Categorías
          </h2>
          <p className="text-sm text-slate-500">
            Agrega, edita o elimina categorías para el inventario.
          </p>
        </div>
      </div>

      {/* Formulario de agregar + botón editar */}
      <div className="flex gap-2 mb-4">
        <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Nombre de la nueva categoría..."
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button
            type="submit"
            className="bg-fuchsia-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-fuchsia-700 flex items-center gap-2"
          >
            <Plus size={18} /> Agregar
          </button>
        </form>
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors ${
            isEditMode
              ? 'bg-amber-500 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
          title={isEditMode ? 'Salir del modo edición' : 'Editar categorías'}
        >
          <Pencil size={18} />
          {isEditMode ? 'Listo' : 'Editar'}
        </button>
      </div>

      {/* Mensaje modo edición */}
      {isEditMode && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700 text-sm">
          <Pencil size={16} />
          <span>
            Modo edición activo. Selecciona una categoría para editarla.
          </span>
        </div>
      )}

      {/* Lista de categorías */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map((cat) => {
          const productCount = productsByCategory[cat]?.length || 0;

          return (
            <div
              key={cat}
              onClick={() => handleSelectCategory(cat)}
              className={`flex justify-between items-center p-3 border rounded-lg group transition-all ${
                isEditMode
                  ? 'bg-amber-50 border-amber-200 cursor-pointer hover:bg-amber-100'
                  : 'bg-slate-50 hover:bg-white hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">{cat}</span>
                <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                  {productCount} prod.
                </span>
              </div>
              {!isEditMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCategory(cat);
                  }}
                  className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                  title="Eliminar categoría"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {isEditMode && <Pencil size={16} className="text-amber-500" />}
            </div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-10 text-slate-400 flex flex-col items-center">
          <AlertCircle size={32} className="mb-2 opacity-50" />
          <p>No hay categorías registradas.</p>
        </div>
      )}

      {/* Modal de edición de categoría */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Tag size={20} className="text-amber-600" />
                <h3 className="font-bold text-slate-800">Editar Categoría</h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Nombre de la categoría */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-lg font-bold"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Productos en esta categoría */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Package size={14} />
                    Productos en esta categoría (
                    {productsByCategory[selectedCategory]?.length || 0})
                  </label>
                  <button
                    onClick={() => setShowAddProducts(!showAddProducts)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition ${
                      showAddProducts
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {showAddProducts ? (
                      <>
                        <X size={12} /> Cerrar
                      </>
                    ) : (
                      <>
                        <PlusCircle size={12} /> Agregar Productos
                      </>
                    )}
                  </button>
                </div>

                {/* Panel para agregar productos */}
                {showAddProducts && (
                  <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="relative mb-2">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Buscar producto para agregar..."
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredAvailableProducts.length > 0 ? (
                        filteredAvailableProducts
                          .slice(0, 20)
                          .map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between p-2 bg-white rounded border hover:bg-green-50"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm text-slate-700 truncate">
                                  {product.title}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  (
                                  {Array.isArray(product.categories)
                                    ? product.categories.join(', ')
                                    : product.category || 'Sin cat.'}
                                  )
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  handleAddProductToCategory(product)
                                }
                                className="text-green-600 hover:bg-green-100 p-1.5 rounded shrink-0"
                                title="Agregar a esta categoría"
                              >
                                <PlusCircle size={16} />
                              </button>
                            </div>
                          ))
                      ) : (
                        <p className="text-sm text-slate-400 text-center py-2">
                          {productSearch
                            ? 'No se encontraron productos'
                            : 'No hay más productos disponibles'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Lista de productos actuales (Visualmente actualizada con pendientes) */}
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  {productsByCategory[selectedCategory]?.length > 0 ? (
                    <div className="divide-y">
                      {productsByCategory[selectedCategory].map((product) => {
                        // Verificar si es un producto recién agregado (para resaltarlo)
                        const isPendingAdd = pendingChanges.some(
                          (c) =>
                            c.productId === product.id &&
                            c.categoryName === selectedCategory &&
                            c.action === 'add'
                        );

                        return (
                          <div
                            key={product.id}
                            className={`flex items-center justify-between p-3 group transition-colors ${
                              isPendingAdd ? 'bg-green-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.title}
                                  className="w-10 h-10 rounded object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center">
                                  <Package
                                    size={16}
                                    className="text-slate-400"
                                  />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-slate-700">
                                  {product.title}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  Stock: {product.stock}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isPendingAdd && (
                                <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                  Nuevo
                                </span>
                              )}
                              <button
                                onClick={() =>
                                  handleRemoveProductFromCategory(product)
                                }
                                className="text-red-400 hover:text-red-600 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Quitar de esta categoría"
                              >
                                <MinusCircle size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 text-sm">
                      No hay productos en esta categoría
                    </div>
                  )}
                </div>
              </div>

              {/* Aviso si hay cambios pendientes */}
              {hasUnsavedChanges && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2 animate-pulse">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    Tienes cambios sin guardar.{' '}
                    {pendingChanges.length > 0 &&
                      `(${pendingChanges.length} movimientos de productos)`}
                  </span>
                </div>
              )}
            </div>

            {/* Footer con botones */}
            <div className="p-4 border-t bg-slate-50 flex gap-3 justify-end shrink-0">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!hasUnsavedChanges}
                className="px-4 py-2 rounded-lg font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save size={16} />
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
