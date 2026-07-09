import type { DesktopSurface } from '@/types/desktop-host';

export function getDesktopSurface(): DesktopSurface {
  return window.desktopHost?.getSurface() ?? 'panel';
}

export function isDesktopHostAvailable(): boolean {
  return typeof window.desktopHost !== 'undefined';
}
