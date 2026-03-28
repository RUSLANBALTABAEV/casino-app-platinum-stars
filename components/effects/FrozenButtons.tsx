'use client';

import React, { useEffect } from 'react';

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function shouldFrost(el: HTMLElement): boolean {
  if (el.closest('[data-no-frost-scope="1"]')) {
    return false;
  }
  if (el.dataset.noFrost === '1') {
    return false;
  }
  // Avoid bottom navigation + tiny icon buttons
  if (el.closest('[data-bottom-nav="1"]')) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.width <= 44 && rect.height > 0 && rect.height <= 44) {
    return false;
  }
  return el.tagName === 'BUTTON' || el.classList.contains('ui-btn');
}

function frost(el: HTMLElement): void {
  if (!shouldFrost(el)) {
    return;
  }
  if (!el.dataset.frostBtn) {
    el.dataset.frostBtn = '1';
  }
  if (!el.dataset.frostStyle) {
    const preferGarland =
      el.classList.contains('ui-btn-primary') || el.dataset.garland === '1';
    el.dataset.frostStyle = preferGarland ? 'garland' : 'icicles';
  }
}

export default function FrozenButtons(): React.JSX.Element | null {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.documentElement.dataset.holiday !== '1') {
      return;
    }

    const apply = (root: ParentNode) => {
      const nodes = root.querySelectorAll<HTMLElement>('button, .ui-btn');
      nodes.forEach(frost);
    };

    apply(document);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (!isElement(node)) {
            continue;
          }
          frost(node);
          apply(node);
        }
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
