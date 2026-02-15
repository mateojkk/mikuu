/**
 * Shared API helpers: axios instance with wallet auth header + address validation.
 */
import axios from 'axios';

/** Ethereum address regex: 0x + 40 hex chars */
const ETH_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(addr: string): boolean {
  return ETH_RE.test(addr);
}

/**
 * Base URL for the API. In separate deployment, set VITE_API_URL in .env
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Standard axios instance for non-authenticated calls
 */
export const baseApi = axios.create({
  baseURL: API_BASE_URL
});

/**
 * Create an axios instance that injects the X-Wallet-Address header
 * for authenticated requests.
 */
export function authAxios(walletAddress: string | undefined) {
  const instance = axios.create({
    baseURL: API_BASE_URL
  });
  if (walletAddress) {
    instance.defaults.headers.common['X-Wallet-Address'] = walletAddress;
  }
  return instance;
}
