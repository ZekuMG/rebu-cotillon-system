// src/data.js
// ♻️ REFACTOR: Configuración central del sistema POS
// Datos de prueba movidos a src/data/seedTransactions.js y src/data/seedLogs.js

// ⚠️ WARNING: Credenciales en texto plano — mover a variables de entorno en producción
export const USERS = {
  admin: { name: 'Dueño', role: 'admin', avatar: 'DU', password: '1234' },
  seller: { name: 'Vendedor', role: 'seller', avatar: 'VE', password: '4321' },
};

export const INITIAL_MEMBERS = [
  {
    id: '1',
    memberNumber: 1,
    name: 'Socio Prueba',
    dni: '12345678',
    phone: '1122334455',
    email: 'socio@test.com',
    extraInfo: 'Socio inicial del sistema',
    points: 50,
    history: [],
  },
];

export const PAYMENT_METHODS = [
  { id: 'Efectivo', label: 'Efectivo' },
  { id: 'MercadoPago', label: 'Mercado Pago' },
  { id: 'Debito', label: 'Débito' },
  { id: 'Credito', label: 'Crédito' },
];

export const INITIAL_CATEGORIES = [
  'Globos',
  'Descartables',
  'Disfraces',
  'Decoración',
  'Velas y Bengalas',
  'Luminoso',
  'Varios',
];

export const INITIAL_INVENTORY = [
  {
    id: 1,
    title: 'Pack Globos Metalizados Dorados',
    brand: 'PartyTime',
    price: 3500,
    purchasePrice: 1800,
    stock: 50,
    category: 'Globos',
    categories: ['Globos'],
    image: 'https://placehold.co/400x400/fbbf24/white?text=Globos',
  },
  {
    id: 2,
    title: 'Set Vasos Neón Fluo (x50)',
    brand: 'Luminix',
    price: 4200,
    purchasePrice: 2100,
    stock: 100,
    category: 'Descartables',
    categories: ['Descartables', 'Luminoso'],
    image: 'https://placehold.co/400x400/a855f7/white?text=Vasos',
  },
  {
    id: 3,
    title: 'Antifaz Veneciano con Plumas',
    brand: 'CarnavalPro',
    price: 1800,
    purchasePrice: 850,
    stock: 25,
    category: 'Disfraces',
    categories: ['Disfraces'],
    image: '',
  },
  {
    id: 4,
    title: 'Piñata Mexicana Multicolor',
    brand: 'FiestaMex',
    price: 8500,
    purchasePrice: 4000,
    stock: 8,
    category: 'Decoración',
    categories: ['Decoración'],
    image: '',
  },
  {
    id: 5,
    title: 'Bengalas para Torta (Pack x4)',
    brand: 'Chispitas',
    price: 1200,
    purchasePrice: 500,
    stock: 200,
    category: 'Velas y Bengalas',
    categories: ['Velas y Bengalas'],
    image: 'https://placehold.co/400x400/3b82f6/white?text=Bengalas',
  },
  {
    id: 6,
    title: 'Guirnalda LED Multicolor 5m',
    brand: 'Luminix',
    price: 6500,
    purchasePrice: 3200,
    stock: 15,
    category: 'Luminoso',
    categories: ['Luminoso', 'Decoración'],
    image: 'https://placehold.co/400x400/10b981/white?text=LED',
  },
  {
    id: 7,
    title: 'Cotillón Año Nuevo (Kit 10 pers)',
    brand: 'PartyTime',
    price: 12000,
    purchasePrice: 6000,
    stock: 5,
    category: 'Varios',
    categories: ['Varios'],
    image: 'https://placehold.co/400x400/ec4899/white?text=Cotillon',
  },
  {
    id: 8,
    title: 'Velas Número 0-9 Glitter',
    brand: 'Chispitas',
    price: 800,
    purchasePrice: 350,
    stock: 45,
    category: 'Velas y Bengalas',
    categories: ['Velas y Bengalas'],
    image: 'https://placehold.co/400x400/f59e0b/white?text=Velas',
  },
  {
    id: 9,
    title: 'Mantel Descartable Premium',
    brand: 'DecoFiesta',
    price: 2200,
    purchasePrice: 1100,
    stock: 30,
    category: 'Descartables',
    categories: ['Descartables', 'Decoración'],
    image: '',
  },
  {
    id: 10,
    title: 'Peluca Afro Colores',
    brand: 'CarnavalPro',
    price: 3500,
    purchasePrice: 1700,
    stock: 12,
    category: 'Disfraces',
    categories: ['Disfraces'],
    image: 'https://placehold.co/400x400/8b5cf6/white?text=Peluca',
  },
];

// ♻️ REFACTOR: Re-export datos de prueba desde módulos separados
// Mantiene compatibilidad con todos los imports existentes
export { INITIAL_TRANSACTIONS } from './data/seedTransactions';
export { INITIAL_LOGS } from './data/seedLogs';

export const COLORS = [
  '#f472b6',
  '#a78bfa',
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#2dd4bf',
  '#818cf8',
];

export const getColorForItem = (id) => COLORS[id % COLORS.length];

export const getInitialState = (key, initialValue) => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : initialValue;
  } catch (error) {
    console.error('Error cargando localStorage', error);
    return initialValue;
  }
};
