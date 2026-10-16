import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let locks = 0;
let originalOverflow = '';

/** Native dialogs keep focus and keyboard interaction inside the topmost sheet. */
export function ModalSheet({ title, children, onClose, busy = false, fullHeight = false, footer }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; fullHeight?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current!;
    const previousFocus = document.activeElement;
    if (locks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    const size = () => {
      element.style.setProperty('--sheet-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
      element.style.setProperty('--sheet-top', `${window.visualViewport?.offsetTop ?? 0}px`);
    };
    size();
    window.visualViewport?.addEventListener('resize', size);
    window.visualViewport?.addEventListener('scroll', size);
    window.addEventListener('resize', size);
    element.showModal();
    return () => {
      element.close();
      window.visualViewport?.removeEventListener('resize', size);
      window.visualViewport?.removeEventListener('scroll', size);
      window.removeEventListener('resize', size);
      if (--locks === 0) document.body.style.overflow = originalOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const element = ref.current!;
    if (!element.contains(document.activeElement)) element.querySelector('button')?.focus({ preventScroll: true });
  }, [title]);
  return createPortal(<dialog ref={ref} aria-labelledby={titleId} className={`modal-sheet${fullHeight ? ' modal-sheet-editor' : ''}`} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')].filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
  }}>
    <div className="sheet-heading"><h2 id={titleId} className="text-2xl font-semibold break-words">{title}</h2><button type="button" className="icon-button shrink-0" aria-label={`Close ${title}`} disabled={busy} onClick={onClose}>×</button></div>
    <div className="sheet-content space-y-4">{children}</div>
    {footer && <div className="sheet-footer">{footer}</div>}
  </dialog>, document.body);
}
