/** True on macOS/iOS, where the command key is shown as ⌘. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function modKeyLabel(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl ';
}
