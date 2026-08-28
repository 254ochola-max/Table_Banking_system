import React, { useState, useEffect } from "react";
import { Download, X, Share, PlusSquare, Smartphone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/shared/BrandLogo";

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // 1. Check if already installed / running in standalone mode
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    setIsStandalone(isRunningStandalone);
    if (isRunningStandalone) return;

    // 2. Check if dismissed recently (within 7 days)
    const dismissedAt = localStorage.getItem("deborahs_pwa_dismissed");
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome|android/.test(ua);

    if (isIOSDevice && isSafari) {
      setIsIOS(true);
      // Give the user a couple of seconds to settle before showing
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // 4. Standard beforeinstallprompt for Chrome / Edge / Android
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a short delay
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. Hide prompt when app is successfully installed
    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.setItem("deborahs_pwa_installed", "true");
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("deborahs_pwa_dismissed", Date.now().toString());
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <>
      {/* Floating Bottom Card */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="bg-white/95 backdrop-blur-md border border-fuchsia-100 rounded-2xl shadow-xl p-4 flex items-center gap-3.5 relative">
          <button
            onClick={handleDismiss}
            aria-label="Close install prompt"
            className="absolute top-2.5 right-2.5 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={15} />
          </button>

          <div className="flex-shrink-0">
            <BrandLogo size={42} className="shadow-xs" />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <h4 className="text-xs font-bold text-gray-900 truncate">Install The Deborahs</h4>
            <p className="text-[11px] text-gray-500 line-clamp-1">Install on your device for fast, full-screen access.</p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleInstallClick}
                className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs h-7 px-3 font-semibold shadow-xs"
              >
                <Download size={13} className="mr-1" /> Install App
              </Button>
              <button
                onClick={handleDismiss}
                className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 font-medium"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Step-by-Step Installation Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="text-fuchsia-600" size={20} />
                <h3 className="font-bold text-sm text-gray-900">Install on iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-600">
              <div className="flex items-start gap-3 p-2.5 bg-fuchsia-50/60 rounded-xl border border-fuchsia-100">
                <span className="flex-shrink-0 w-5 h-5 bg-fuchsia-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">1</span>
                <div>
                  Tap the <strong className="text-gray-900">Share</strong> button at the bottom of Safari <Share size={13} className="inline text-fuchsia-600 mx-1" />.
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 bg-fuchsia-50/60 rounded-xl border border-fuchsia-100">
                <span className="flex-shrink-0 w-5 h-5 bg-fuchsia-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">2</span>
                <div>
                  Scroll down and select <strong className="text-gray-900">Add to Home Screen</strong> <PlusSquare size={13} className="inline text-fuchsia-600 mx-1" />.
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 bg-fuchsia-50/60 rounded-xl border border-fuchsia-100">
                <span className="flex-shrink-0 w-5 h-5 bg-fuchsia-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">3</span>
                <div>
                  Tap <strong className="text-gray-900">Add</strong> in the top right corner.
                </div>
              </div>
            </div>

            <Button
              className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-semibold h-9"
              onClick={() => {
                setShowIOSGuide(false);
                setShowPrompt(false);
              }}
            >
              <Check size={14} className="mr-1.5" /> Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
