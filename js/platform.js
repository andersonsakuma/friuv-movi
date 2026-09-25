/*
 * Detecção de plataforma e ajudas específicas de iPhone/iPad.
 * O Safari não implementa Bluetooth Web; navegadores como o Bluefy implementam.
 * Por isso o app decide pelo que o navegador oferece, não pelo nome dele.
 */
(function () {
  "use strict";
  const ua = navigator.userAgent || "";
  const touchMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  const ios = /iPad|iPhone|iPod/.test(ua) || touchMac;
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const hasBle = typeof navigator !== "undefined" && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function";
  // Safari de verdade: nem Chrome, nem Edge, nem os navegadores com BLE do iOS.
  const safari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua) && !hasBle;

  const PLAT = {
    ios,
    android: /Android/.test(ua),
    standalone,
    safari,
    hasBle,
    /** iPhone/iPad em navegador que fala Bluetooth (Bluefy, WebBLE). */
    iosBle: ios && hasBle,
    /** iPhone/iPad sem Bluetooth: Safari, Chrome do iOS, etc. */
    iosSemBle: ios && !hasBle,
    bluefyUrl: "https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055",
    appUrl: location.origin + location.pathname,
  };

  /** Bloqueio de rolagem que funciona no iOS (body fixo + restauração). */
  let lockedY = 0, locked = false;
  PLAT.lockScroll = function () {
    if (locked) return;
    lockedY = window.scrollY || 0;
    const b = document.body.style;
    b.position = "fixed";
    b.top = `-${lockedY}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
    b.overflow = "hidden";
    locked = true;
  };
  PLAT.unlockScroll = function () {
    if (!locked) return;
    const b = document.body.style;
    b.position = b.top = b.left = b.right = b.width = b.overflow = "";
    locked = false;
    window.scrollTo(0, lockedY);
  };

  /** Compartilhar arquivo (AirDrop, WhatsApp, Arquivos). Devolve true se abriu a folha. */
  PLAT.shareFile = async function (file, title) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return true;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return true; // usuário fechou a folha
    }
    return false;
  };

  PLAT.copiar = async function (texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false;
    }
  };

  window.PLAT = PLAT;
  document.documentElement.classList.toggle("is-ios", ios);
  document.documentElement.classList.toggle("is-standalone", standalone);
})();
