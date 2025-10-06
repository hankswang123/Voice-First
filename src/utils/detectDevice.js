// utils/detectDevice.js
export const detectDevice = () => {
  const ua = navigator.userAgent;

  console.log(`userAgent: ${ua}`);

  // 检测平板设备（如 iPad、Android 平板）
  const isTablet = /iPad|Tablet|Android/.test(ua) && !/(Mobile|iPhone|Android|iPod|BlackBerry|Windows Phone)/.test(ua);
  //const isTablet = true;

  // 检测手机设备（如 iPhone、Android 手机）
  const isMobile = /Mobile|iPhone|Android|iPod|BlackBerry|Windows Phone/.test(ua);

  // 检测桌面设备
  const isDesktop = !isTablet && !isMobile;

  console.log(`Device Detection: isTablet=${isTablet}, isMobile=${isMobile}, isDesktop=${isDesktop}`);

  return { isTablet, isMobile, isDesktop };
};