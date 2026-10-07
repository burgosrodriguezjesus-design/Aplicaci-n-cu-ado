/** Enlaces para llamar y escribir por WhatsApp. */
export function phoneDigits(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = `34${d}`;
  return d;
}

export function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function waLink(phone: string | null | undefined, text: string) {
  const base = phone ? `https://wa.me/${phoneDigits(phone)}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
