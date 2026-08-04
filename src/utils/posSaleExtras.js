export const POS_BAG_EXTRA_ID = 'pos_bag';
export const POS_BAG_ITEM_KIND = 'pos_bag';
export const POS_BAG_TITLE = 'Bolsita';
export const POS_BAG_PRICE = 50;
export const POS_BAG_CATEGORY = 'Extras POS';

const normalizeBagText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const isPosBagItem = (item = {}) => {
  const itemId = String(item.id ?? item.productId ?? item.product_id ?? '');
  const itemKind = String(item.itemKind ?? item.item_kind ?? item.kind ?? '');
  const title = normalizeBagText(item.title ?? item.product_title ?? item.name);
  const isCustom = Boolean(item.isCustom ?? item.is_custom ?? item.isTemporary);

  return Boolean(
    item.isPosBag ||
    item.is_pos_bag ||
    itemKind === POS_BAG_ITEM_KIND ||
    itemId === POS_BAG_EXTRA_ID ||
    (isCustom && title === normalizeBagText(POS_BAG_TITLE))
  );
};

export const createPosBagSaleItem = () => ({
  id: POS_BAG_EXTRA_ID,
  productId: POS_BAG_EXTRA_ID,
  title: POS_BAG_TITLE,
  price: POS_BAG_PRICE,
  priceAtSale: POS_BAG_PRICE,
  quantity: 1,
  qty: 1,
  subtotal: POS_BAG_PRICE,
  lineSubtotal: POS_BAG_PRICE,
  product_type: 'quantity',
  isCustom: true,
  isPosBag: true,
  itemKind: POS_BAG_ITEM_KIND,
  category: POS_BAG_CATEGORY,
  categories: [POS_BAG_CATEGORY],
  cost: 0,
  unitCost: 0,
  costSource: 'excluded_pos_extra',
  stock: 999999,
});

export const getPosBagItemsSummary = (items = []) =>
  (Array.isArray(items) ? items : []).reduce(
    (summary, item) => {
      if (!isPosBagItem(item)) return summary;

      const quantity = Number(item.qty ?? item.quantity ?? 1) || 1;
      const explicitSubtotal = Number(
        item.subtotal ?? item.lineSubtotal ?? item.line_subtotal
      );
      const revenue = Number.isFinite(explicitSubtotal)
        ? explicitSubtotal
        : (Number(item.price ?? item.priceAtSale ?? POS_BAG_PRICE) || 0) * quantity;

      return {
        count: summary.count + quantity,
        revenue: summary.revenue + revenue,
      };
    },
    { count: 0, revenue: 0 },
  );
