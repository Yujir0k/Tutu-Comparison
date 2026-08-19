import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Offer } from '../../types';
import { offerFallbackUrl } from './transportViewModel';

const checkoutLinkCache = new Map<string, string>();

interface CheckoutButtonProps {
  offer: Offer;
  label: string;
  className?: string;
}

/** Resolve a fresh Tutu checkout URL while keeping a real fallback link. */
export function CheckoutButton({ offer, label, className }: CheckoutButtonProps) {
  const [opening, setOpening] = useState(false);
  const fallbackUrl = offerFallbackUrl(offer);
  const hasCheckoutTarget = Boolean(offer.checkout_ref || fallbackUrl);

  const openCheckout = async () => {
    const cached = checkoutLinkCache.get(offer.offer_id);
    if (cached) {
      window.open(cached, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!offer.checkout_ref) {
      if (fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.opener = null;
      popup.document.title = 'Открываем выбранный вариант на Туту';
      popup.document.body.textContent = 'Открываем выбранный вариант на Туту…';
    }
    setOpening(true);

    try {
      const response = await fetch('/api/checkout-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutRef: offer.checkout_ref }),
      });
      const data = (await response.json()) as { checkout_url?: string; error?: string };
      if (!response.ok || !data.checkout_url) {
        throw new Error(data.error || 'Не удалось получить ссылку');
      }
      checkoutLinkCache.set(offer.offer_id, data.checkout_url);
      if (popup) popup.location.href = data.checkout_url;
      else window.location.href = data.checkout_url;
    } catch {
      if (fallbackUrl) {
        if (popup) popup.location.href = fallbackUrl;
        else window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      } else if (popup) {
        popup.close();
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      className={className}
      type="button"
      disabled={opening || !hasCheckoutTarget}
      onClick={openCheckout}
    >
      {opening ? 'Открываем…' : hasCheckoutTarget ? label : 'Переход недоступен'}{' '}
      <ChevronRight size={17} />
    </button>
  );
}
