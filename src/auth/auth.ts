import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { configured, supabase } from '../lib/supabase';
import { reassignOutbox } from '../store/outbox';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT = 'climbdex://auth';
const MERGE_KEY = 'pending-anon-merge';
const MERGE_FROM_KEY = 'pending-anon-merge-from';
let pending: Promise<void> | null = null;

async function openAuth(url: string) {
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT);
  if (result.type !== 'success') return null;
  const params = new URLSearchParams();
  const query = result.url.split('?')[1]?.split('#')[0] ?? '';
  const fragment = result.url.split('#')[1] ?? '';
  for (const part of [query, fragment]) new URLSearchParams(part).forEach((v, k) => params.set(k, v));
  return params;
}

async function applySession(params: URLSearchParams) {
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.refreshSession();
  if (error) throw error;
}

async function signInFresh() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) throw error ?? new Error('로그인 주소를 못 만들었어요');
  const params = await openAuth(data.url);
  if (!params) return false;
  if (params.get('error')) throw new Error(params.get('error_description') ?? params.get('error') ?? '로그인 실패');
  await applySession(params);
  return true;
}

export async function signInWithGoogle() {
  const { data: current } = await supabase.auth.getSession();
  if (!current.session?.user.is_anonymous) {
    await signInFresh();
    return;
  }
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (!error && data.url) {
    const params = await openAuth(data.url);
    if (!params || params.get('error') === 'access_denied') return;
    if (!params.get('error')) {
      await applySession(params);
      return;
    }
    if (params.get('error_code') !== 'identity_already_exists') console.log('link identity error', params.get('error_code'));
  } else {
    console.log('link identity unavailable', error?.message);
  }
  const { data: ticket, error: ticketError } = await supabase.from('anon_merge').insert({}).select('token').single();
  if (ticketError || !ticket) throw ticketError ?? new Error('기록을 옮길 준비를 못 했어요. 다시 시도해 주세요');
  await SecureStore.setItemAsync(MERGE_KEY, ticket.token);
  await SecureStore.setItemAsync(MERGE_FROM_KEY, current.session.user.id);
  if (!(await signInFresh())) return;
  await retryMerge();
}

export async function retryMerge() {
  const token = await SecureStore.getItemAsync(MERGE_KEY);
  if (!token) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) return;
  const { error } = await supabase.rpc('merge_anonymous', { t: token });
  if (error) return console.log('merge anonymous error', error.message);
  const from = await SecureStore.getItemAsync(MERGE_FROM_KEY);
  if (from) reassignOutbox(from, data.session.user.id);
  await SecureStore.deleteItemAsync(MERGE_KEY);
  await SecureStore.deleteItemAsync(MERGE_FROM_KEY);
}

export function ensureSession() {
  if (!configured) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) console.log('anonymous sign-in error', error.message);
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export function signOut() {
  return supabase.auth.signOut();
}
