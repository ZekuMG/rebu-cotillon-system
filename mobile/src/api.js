import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from './async.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const client = configured ? createClient(url, key, {
  auth: { storageKey: 'rebu-stock-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: boundedFetch, headers: { 'x-client-info': 'rebu-stock-pwa' } },
}) : null;
let pendingLogout = null;

async function rpc(name, args, signal) {
  if (!client) throw new Error('Falta configurar la conexión de Rebu.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, 20000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const { data, error } = await client.rpc(name, args).abortSignal(controller.signal);
    if (error) throw error;
    return data;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
export async function listUsers(signal) {
  const { data, error } = await client.from('app_users_public').select('id,display_name').eq('is_active', true).order('display_name').abortSignal(signal);
  if (error) throw error;
  return data || [];
}
export async function login(userId, password) {
  if (pendingLogout) await pendingLogout;
  const result = await rpc('verify_app_user_login_auth_bridge', { p_user_id: userId, p_password: password });
  const user = Array.isArray(result) ? result[0] : result;
  if (!user?.auth_email) throw new Error('No se pudo ingresar. Revisá la contraseña y la vinculación del usuario con Rebu.');
  const { data, error } = await client.auth.signInWithPassword({ email: user.auth_email, password });
  if (error) throw new Error('No se pudo ingresar. Revisá tu contraseña.');
  if (!data?.session) throw new Error('No se pudo iniciar la sesión.');
  try { return await getProfile(); } catch (error) { await client.auth.signOut({ scope: 'local' }); throw error; }
}
export const getProfile = () => rpc('rebu_mobile_profile');
export const getProduct = (id) => rpc('rebu_mobile_product', { p_product_id: id });
export const stockStatus = (id) => rpc('rebu_mobile_stock_status', { p_operation_id: id });
export const searchProducts = (query, offset, signal, exact = false) => rpc('rebu_mobile_search_products', { p_query: query.trim(), p_offset: offset, p_exact: exact }, signal);
export const saveStock = (operation) => rpc('rebu_mobile_save_stock', {
  p_operation_id: operation.id,
  p_product_id: operation.product.id,
  p_mode: operation.mode,
  p_quantity: operation.quantity,
  p_expected_stock: operation.before,
  p_reason: operation.reason,
});
export function logout() {
  if (pendingLogout) return pendingLogout;
  pendingLogout = client.auth.signOut({ scope: 'local' }).finally(() => {
    try { localStorage.removeItem('rebu-stock-auth-v1'); } catch { /* UI still closes on devices without storage. */ }
    pendingLogout = null;
  });
  // A reload must not restore this user's token while remote sign-out waits.
  try {
    localStorage.removeItem('rebu-stock-auth-v1');
    localStorage.setItem('rebu-stock-logout-v1', String(Date.now()));
  } catch { /* Auth SDK will finish clearing its own storage. */ }
  return pendingLogout;
}
export const isAuthError = (error) => ['42501', 'PGRST301', 'PGRST302', 'PGRST303', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error?.code) || Number(error?.status) === 401;
export function friendlyError(error) {
  if (error?.code === 'PGRST202') return 'La conexión móvil todavía no está habilitada en la base de Rebu.';
  if (isAuthError(error)) return 'Tu sesión o tus permisos cambiaron. Volvé a ingresar.';
  if (error?.code === '40001') return 'El stock cambió desde otra PC o celular. Actualizá el producto y revisá la cantidad antes de confirmar.';
  if (/fetch|network|failed to fetch|abort|timeout/i.test(error?.message || '')) return 'No pudimos comunicarnos con Rebu. Revisá tu conexión.';
  return error?.message || 'No se pudo completar la operación. Intentá nuevamente.';
}
