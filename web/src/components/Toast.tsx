import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';

interface ToastItem {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

const Ctx = createContext<{ show: (text: string, kind?: 'ok' | 'error') => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 2800);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed inset-x-0 bottom-24 lg:bottom-6 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`anim-sheet pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold shadow-lg max-w-md ${
              t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-choco-800 text-white'
            }`}
          >
            {t.kind === 'error' ? <CircleX size={20} className="shrink-0" /> : <CircleCheck size={20} className="shrink-0 text-emerald-300" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
