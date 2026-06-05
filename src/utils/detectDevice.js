// utils/detectDevice.js — cached once per session (device never changes)
let _cached = null;

export const detectDevice = () => {
  if (_cached) return _cached;

  const ua = navigator.userAgent;

  // 检测平板设备（如 iPad、Android 平板）
  const isTablet = /iPad|Tablet|Android/.test(ua) && !/(Mobile|iPhone|Android|iPod|BlackBerry|Windows Phone)/.test(ua);

  // 检测手机设备（如 iPhone、Android 手机）
  const isMobile = /Mobile|iPhone|Android|iPod|BlackBerry|Windows Phone/.test(ua);

  // 检测桌面设备
  const isDesktop = !isTablet && !isMobile;

  _cached = { isTablet, isMobile, isDesktop };
  return _cached;
};