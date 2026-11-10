/**
 * Opening the guided notifications setup from anywhere (the chat status bar, the home page, the banner slot). The
 * sheet itself is `PushSetupHost` (`banner-slot.tsx`, mounted on every dashboard page); the banner slot shows the one «الإشعارات غير
 * مفعّلة» line when nothing more important is waiting (design review P1-5; it replaced the bar that sat on every
 * page). Db-free.
 */
export const OPEN_PUSH_SETUP_EVENT = "naseeb:open-push-setup";

export function openPushSetup() {
  window.dispatchEvent(new Event(OPEN_PUSH_SETUP_EVENT));
}
