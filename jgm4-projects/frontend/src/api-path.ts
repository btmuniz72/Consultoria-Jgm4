const configuredPath = typeof document === 'undefined' ? '' : document.querySelector<HTMLMetaElement>('meta[name="jgm4-api-base-path"]')?.content?.trim() ?? '';
const isSafePath = (value: string) => value.startsWith('/') && !value.startsWith('//') && !value.includes('..') && !value.includes('?') && !value.includes('#') && !value.includes('\\');

/** API base comes from the frontend build configuration; local/dev builds fall back to the conventional same-origin path. */
export const API_BASE_PATH = isSafePath(configuredPath) && configuredPath !== '/' ? configuredPath.replace(/\/+$/, '') : '/api';
export function apiUrl(path: string) {
  const suffix = path.startsWith('/api') ? path.slice(4) : path;
  return `${API_BASE_PATH}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}
